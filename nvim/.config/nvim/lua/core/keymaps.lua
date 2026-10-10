-- Thin wrapper around vim.keymap.set with sensible defaults.
local function map(mode, lhs, rhs, opts)
  opts = vim.tbl_extend('force', { noremap = true, silent = true }, opts or {})
  vim.keymap.set(mode, lhs, rhs, opts)
end

-- Clear search highlighting
map('n', '<leader>c', '<cmd>nohlsearch<CR>', { desc = 'Clear search highlight' })

-- Splits
map('n', '<leader>wo', '<C-w>n', { desc = 'New split' })
map('n', '<leader>we', '<C-w>v', { desc = 'Split vertically' })
map('n', '<leader>wt', '<cmd>vert term<CR>', { desc = 'Vertical terminal split' })

-- hjkl, not arrows. The EDIT-layer arrows are the better cluster — one hand,
-- four adjacent fingers, in direction order — but a <leader>w sequence restarts
-- on every press, so the thumb hold is paid every time and never amortises:
-- measured 5.7 -> 7.2 effort for one window move. tmux keeps the arrows because
-- -r holds the layer open across a run and it crosses over at two presses.
map('n', '<leader>wh', '<C-w>h', { desc = 'Go to left window' })
map('n', '<leader>wj', '<C-w>j', { desc = 'Go to lower window' })
map('n', '<leader>wk', '<C-w>k', { desc = 'Go to upper window' })
map('n', '<leader>wl', '<C-w>l', { desc = 'Go to right window' })
map('n', '<leader>wc', '<C-w>c', { desc = 'Close window' })

-- Save / quit
map('n', '<leader>s', '<cmd>write<CR>', { desc = 'Save file' })
-- Not <leader>x: x is a 30 ms two-key combo on this keyboard, the tightest
-- window in the keymap, and a combo that fires early cannot fail safe.
map('n', '<leader>q', '<cmd>qa!<CR>', { desc = 'Quit all (no save)' })

-- Terminal
map('n', '<leader>t', '<cmd>terminal<CR>', { desc = 'Open terminal' })
map('t', '<Esc>', '<C-\\><C-n>', { desc = 'Terminal: exit to normal mode' })
map('t', 'fd', '<C-\\><C-n>', { desc = 'Terminal: exit to normal mode' })

-- Escape lives behind a thumb hold on EDIT, and modal editing presses it more
-- than most letters. fd is a cross-hand roll on the base layer, same idea as
-- the terminal-mode binding above.
map('i', 'fd', '<Esc>', { desc = 'Exit insert mode' })
map('v', 'fd', '<Esc>', { desc = 'Exit visual mode' })

-- Telescope
map('n', '<leader>ff', '<cmd>Telescope find_files<CR>', { desc = 'Find files' })
map('n', '<leader>fg', '<cmd>Telescope live_grep<CR>', { desc = 'Live grep' })
map('n', '<leader>fb', '<cmd>Telescope buffers<CR>', { desc = 'Find buffers' })

-- Hop
map('n', '<leader>hh', '<cmd>HopWord<CR>', { desc = 'Hop to word' })

-- Oil
map('n', '<leader>oo', '<cmd>Oil<CR>', { desc = 'Open parent directory (Oil)' })
