local ensure_installed = {
  -- Research
  "python",
  "cuda",
  "c",
  "cpp",
  "rust",
  "julia",
  "r",

  -- Writing
  "latex",
  "bibtex",
  "typst",
  "markdown",
  "markdown_inline",

  -- Data
  "json",
  "yaml",
  "toml",
  "sql",
  "proto",

  -- Infrastructure
  "bash",
  "dockerfile",
  "make",
  "cmake",
  "ninja",
  "ssh_config",

  -- Editor
  "diff",
  "gitcommit",
  "gitignore",
  "git_rebase",
  "regex",
  "comment",
  "query",
  "vim",
  "vimdoc",

  -- Web
  "html",
  "css",
  "javascript",
  "typescript",

  -- Miscellaneous
  "go",
  "graphql",
}

local function configuration()
  require('nvim-treesitter').install(ensure_installed)

  local function start(buffer )
    if pcall(vim.treesitter.start, buffer ) then
      vim.bo[buffer ].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
    end
  end

  vim.api.nvim_create_autocmd('FileType', {
    callback = function(args)
      start(args.buf)
    end,
  })

  for _, buffer in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_is_loaded(buffer ) then
      start(buffer )
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
