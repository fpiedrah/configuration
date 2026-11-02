return {
  'stevearc/conform.nvim',
  cmd = 'ConformInfo',
  keys = {
    {
      '<leader>lf',
      function()
        require('conform').format({ async = true, lsp_format = 'fallback' })
      end,
      desc = 'Format Buffer',
    },
  },
  opts = {
    formatters_by_ft = {
      lua = { 'stylua' },
      python = { 'ruff_format', 'ruff_organize_imports' },
    },
  },
}
