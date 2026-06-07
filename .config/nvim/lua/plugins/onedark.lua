local function configuration()
  require('onedark').load()
end

return {
  'navarasu/onedark.nvim',
  lazy = false,      -- Load during startup...
  priority = 1000,   -- ...and before other plugins, so highlights are correct.
  config = configuration,
}
