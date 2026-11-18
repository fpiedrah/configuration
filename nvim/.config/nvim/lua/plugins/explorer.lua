return {
  'stevearc/oil.nvim',
  lazy = false,
  keys = {
    { '<leader>oo', '<cmd>Oil<CR>', desc = 'Open Parent Directory' },
  },
  dependencies = { 'nvim-tree/nvim-web-devicons' },
  opts = { view_options = { natural_order = false } },
}
