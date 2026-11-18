local vault = require('core.vault')

local function resolve(file, source)
  local path = vault.resolve(file, source)
  return path and path .. (source:match('#page=%d+$') or '')
end

return {
  'folke/snacks.nvim',
  lazy = false,
  opts = {
    image = {
      enabled = true,
      resolve = resolve,
      doc = { inline = false, float = true },
      math = { enabled = false },
    },
  },
}
