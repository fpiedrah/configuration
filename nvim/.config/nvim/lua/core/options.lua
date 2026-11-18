local opt = vim.opt

opt.clipboard = 'unnamedplus'
opt.swapfile = false
opt.undofile = true
opt.mouse = 'a'
opt.confirm = true

opt.number = true
opt.relativenumber = true
opt.cursorline = true
opt.signcolumn = 'yes'
opt.scrolloff = 8
opt.sidescrolloff = 8
opt.showmatch = true
opt.foldmethod = 'marker'
opt.splitright = true
opt.splitbelow = true
opt.laststatus = 3

opt.ignorecase = true
opt.smartcase = true

opt.wrap = false
opt.linebreak = true

opt.expandtab = true
opt.shiftwidth = 4
opt.tabstop = 4

opt.synmaxcol = 240
opt.updatetime = 250

opt.shortmess:append('sI')

vim.filetype.add({ extension = { nf = 'groovy' } })
