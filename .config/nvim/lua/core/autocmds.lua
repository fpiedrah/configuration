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
    'typst',
  },
  command = 'setlocal shiftwidth=2 tabstop=2'
})

-- Enable text wrapping at line end
augroup('setWrap', { clear = true })
autocmd('Filetype', {
  group = 'setWrap',
  pattern = {
    'typst',
  },
  command = 'setlocal wrap'
})

autocmd({ "BufRead", "BufNewFile" }, {
  pattern = "*.nf",
  command = "setfiletype groovy",
})
