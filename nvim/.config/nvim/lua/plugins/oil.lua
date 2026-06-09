local function configuration()
  local oil = require('oil')

  oil.setup()
end

return {
  'stevearc/oil.nvim',
  cmd = 'Oil',
  dependencies = { 'nvim-tree/nvim-web-devicons' },
  config = configuration,
}
