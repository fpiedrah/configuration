local augroup = vim.api.nvim_create_augroup
local autocmd = vim.api.nvim_create_autocmd

-- Set indentation to 2 spaces
augroup('setIndent', { clear = true })
autocmd('Filetype', {
  group = 'setIndent',
  pattern = {
    'xml',
    'html',
    'xhtml',
    'css',
    'scss',
    'javascript',
    'typescript',
    'yaml',
    'lua',
    'groovy',
  },
  command = 'setlocal shiftwidth=2 tabstop=2'
})

autocmd({ "BufRead", "BufNewFile" }, {
  pattern = "*.nf",
  command = "setfiletype groovy",
})
