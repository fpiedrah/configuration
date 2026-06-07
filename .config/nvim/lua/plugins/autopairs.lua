local function configuration()
  local autopairs = require('nvim-autopairs')

  autopairs.setup()
end

return {
  'windwp/nvim-autopairs',
  event = 'InsertEnter',
  config = configuration,
}
