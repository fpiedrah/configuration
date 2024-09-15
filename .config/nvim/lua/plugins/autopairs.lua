local function configuration()
  local autopairs = require('nvim-autopairs')

  autopairs.setup()
end

return {
  'windwp/nvim-autopairs',
  config = configuration,
}
