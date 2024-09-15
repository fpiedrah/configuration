local function configuration()
  local luasnip = require('luasnip')
  local from_vscode = require('luasnip.loaders.from_vscode')

  luasnip.setup()
  from_vscode.lazy_load(
    {
      paths = '~/.config/nvim/snippets'
    }
  )
end

return {
  'L3MON4D3/LuaSnip',
  dependencies = {
    'rafamadriz/friendly-snippets',
  },
  config = configuration,
}
