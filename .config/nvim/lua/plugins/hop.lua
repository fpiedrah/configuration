local function configuration()
  local hop = require('hop')

  hop.setup {
    keys = 'tharnisopqulfcymkjgwb'
  }
end

return {
  'phaazon/hop.nvim',
  branch = 'v2',
  config = configuration,
}
