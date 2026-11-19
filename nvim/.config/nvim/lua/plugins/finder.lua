local FIND_COMMAND = { 'fd', '--type', 'f', '--hidden', '--color', 'never', '--exclude', '.git' }

local function find_dotfiles()
  require('telescope.builtin').find_files({
    prompt_title = 'Dotfiles',
    cwd = '~/Workspace/.configuration',
    find_command = vim.list_extend(vim.deepcopy(FIND_COMMAND), {
      '--no-ignore',
      '--exclude',
      'node_modules',
    }),
  })
end

local function configuration()
  local telescope = require('telescope')

  telescope.setup({
    pickers = {
      find_files = { find_command = FIND_COMMAND },
    },
  })

  telescope.load_extension('fzf')
end

return {
  'nvim-telescope/telescope.nvim',
  cmd = 'Telescope',
  keys = {
    { '<leader>ff', '<cmd>Telescope find_files<CR>', desc = 'Find Files' },
    { '<leader>fg', '<cmd>Telescope live_grep<CR>', desc = 'Live Grep' },
    { '<leader>fb', '<cmd>Telescope buffers<CR>', desc = 'Find Buffers' },
    { '<leader>fd', find_dotfiles, desc = 'Find Dotfiles' },
  },
  dependencies = {
    'nvim-lua/plenary.nvim',
    'nvim-tree/nvim-web-devicons',
    { 'nvim-telescope/telescope-fzf-native.nvim', build = 'make' },
  },
  config = configuration,
}
