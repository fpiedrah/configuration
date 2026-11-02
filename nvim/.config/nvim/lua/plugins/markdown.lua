return {
  'MeanderingProgrammer/render-markdown.nvim',
  ft = { 'markdown' },
  dependencies = { 'nvim-treesitter/nvim-treesitter', 'nvim-tree/nvim-web-devicons' },
  ---@module 'render-markdown'
  ---@type render.md.UserConfig
  opts = {
    render_modes = { 'n', 'no', 'v', 'V', '\22', 'c', 't' },
    win_options = {
      wrap = { default = true, rendered = false },
    },
  },
}
