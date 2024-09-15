local function configuration()
    local telescope = require('telescope')

    telescope.load_extension('fzf')
end

return {
  'nvim-telescope/telescope.nvim',
  dependencies = {
    'nvim-lua/plenary.nvim',
    'nvim-tree/nvim-web-devicons',
    { 'nvim-telescope/telescope-fzf-native.nvim', build = 'make' },
  },
  branch = '0.1.x',
  config = configuration,
}
