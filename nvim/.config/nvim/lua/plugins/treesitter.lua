local INJECTED = { 'comment', 'regex', 'latex' }

local function start(buffer)
  if vim.api.nvim_buf_is_valid(buffer) and pcall(vim.treesitter.start, buffer) then
    vim.bo[buffer].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
  end
end

local function attach(buffer)
  local treesitter = require('nvim-treesitter')
  local language = vim.treesitter.language.get_lang(vim.bo[buffer].filetype)
  local missing = vim.list_contains(treesitter.get_available(), language)
    and not vim.list_contains(treesitter.get_installed(), language)

  if not missing then
    return start(buffer)
  end

  treesitter.install(language):await(vim.schedule_wrap(function()
    start(buffer)
  end))
end

local function configuration()
  require('nvim-treesitter').install(INJECTED)

  vim.api.nvim_create_autocmd('FileType', {
    group = vim.api.nvim_create_augroup('treesitter_start', { clear = true }),
    callback = function(event)
      attach(event.buf)
    end,
  })

  for _, buffer in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_is_loaded(buffer) then
      attach(buffer)
    end
  end
end

return {
  'nvim-treesitter/nvim-treesitter',
  branch = 'main',
  build = ':TSUpdate',
  event = { 'BufReadPost', 'BufNewFile' },
  config = configuration,
}
