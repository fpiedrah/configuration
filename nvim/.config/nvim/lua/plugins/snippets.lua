-- Personal Snippets
local SNIPPETS_DIRECTORY = vim.fn.stdpath('config') .. '/snippets'

local function configuration()
  local loader = require('luasnip.loaders.from_vscode')

  require('luasnip').setup()
  loader.lazy_load()
  loader.lazy_load({ paths = { SNIPPETS_DIRECTORY } })
end

return {
  'L3MON4D3/LuaSnip',
  event = 'InsertEnter',
  dependencies = { 'rafamadriz/friendly-snippets' },
  config = configuration,
}
