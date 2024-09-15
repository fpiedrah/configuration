local function configuration()
  local treesitter = require('nvim-treesitter.configs')

  treesitter.setup {
    ensure_installed = 'all',

    sync_install = false,

    highlight = {
      enable = true,
    },
  }
end

return {
  'nvim-treesitter/nvim-treesitter',
  config = configuration,
}
