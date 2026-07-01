local function configuration()
  local hop = require('hop')

  hop.setup {
    keys = 'tharnisopqulfcymkjgwb'
  }
end

return {
  'smoka7/hop.nvim',
  cmd = { 'HopWord', 'HopLine', 'HopChar1', 'HopChar2', 'HopPattern' },
  config = configuration,
}
