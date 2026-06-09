local function configuration()
    local telescope = require('telescope')

    telescope.load_extension('fzf')
end

return {
    'nvim-telescope/telescope.nvim',
    cmd = 'Telescope',
    dependencies = {
        'nvim-lua/plenary.nvim',
        'nvim-tree/nvim-web-devicons',
        { 'nvim-telescope/telescope-fzf-native.nvim', build = 'make' },
    },
    branch = 'master',
    config = configuration,
}
