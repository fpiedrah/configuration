local PARSERS = {
  -- Research
  'python',
  'cuda',
  'c',
  'cpp',
  'rust',
  'julia',
  'r',

  -- Writing
  'latex',
  'bibtex',
  'typst',
  'markdown',
  'markdown_inline',

  -- Data
  'json',
  'yaml',
  'toml',
  'sql',
  'proto',

  -- Infrastructure
  'bash',
  'dockerfile',
  'make',
  'cmake',
  'ninja',
  'ssh_config',

  -- Editor
  'diff',
  'gitcommit',
  'gitignore',
  'git_rebase',
  'regex',
  'comment',
  'lua',
  'query',
  'vim',
  'vimdoc',

  -- Web
  'html',
  'css',
  'javascript',
  'typescript',

  -- Miscellaneous
  'go',
  'graphql',
}

-- Highlighting and Indentation
local function start(buffer)
  if pcall(vim.treesitter.start, buffer) then
    vim.bo[buffer].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
  end
end

local function configuration()
  require('nvim-treesitter').install(PARSERS)

  vim.api.nvim_create_autocmd('FileType', {
    group = vim.api.nvim_create_augroup('treesitter_start', { clear = true }),
    callback = function(event)
      start(event.buf)
    end,
  })

  -- Already Open Buffers
  for _, buffer in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_is_loaded(buffer) then
      start(buffer)
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
