local function configuration()
  local treesitter = require('nvim-treesitter.configs')

  treesitter.setup {
    ensure_installed = {
      "bash",
      "c",
      "cpp",
      "cmake",
      "css",
      "diff",
      "dockerfile",
      "dot",
      "elixir",
      "go",
      "graphql",
      "html",
      "http",
      "java",
      "javascript",
      "json",
      "julia",
      "kotlin",
      "lua",
      "make",
      "markdown",
      "markdown_inline",
      "php",
      "python",
      "query",
      "regex",
      "ruby",
      "rust",
      "scss",
      "solidity",
      "sql",
      "swift",
      "toml",
      "typescript",
      "vim",
      "vimdoc",
      "vue",
      "yaml",
      "zig",
    },

    sync_install = false,

    highlight = {
      enable = true,
    },
    indent = {
      enable = true,
    },
  }
end

return {
  'nvim-treesitter/nvim-treesitter',
  config = configuration,
}
