vim.cmd [[
  augroup packer_user_config
    autocmd!
    autocmd BufWritePost installer.lua source <afile> | PackerSync
  augroup end
]]

local status_ok, packer = pcall(require, 'packer')

if not status_ok then
  return
end

return packer.startup(function(use)
  -- Packer
  use 'wbthomason/packer.nvim'

  -- Treesitter
  use 'nvim-treesitter/nvim-treesitter'

  -- LSP
  use {
    'neovim/nvim-lspconfig',
    requires = {
      'hrsh7th/cmp-nvim-lsp',
      'williamboman/mason.nvim',
      'williamboman/mason-lspconfig.nvim',
    }
  }

  -- Snippets
  use {
    'L3MON4D3/LuaSnip',
    requires = {
      'rafamadriz/friendly-snippets',
    }
  }

  -- Autocomplete
  use {
    'hrsh7th/nvim-cmp',
    requires = {
      'hrsh7th/cmp-nvim-lsp',
      'hrsh7th/cmp-path',
      'hrsh7th/cmp-buffer',
      'saadparwaiz1/cmp_luasnip',
      'onsails/lspkind.nvim',
      'octaltree/cmp-look',
    },
  }

  -- Autopair
  use {
    'windwp/nvim-autopairs',
    config = function()
      require('nvim-autopairs').setup()
    end
  }

  -- Color Schemes
  use 'navarasu/onedark.nvim'
  
  -- Telescope
  use {
    'nvim-telescope/telescope.nvim',
    requires = { 
      'nvim-lua/plenary.nvim',
      'nvim-lua/popup.nvim',
    }
  }

  -- Status Line
  use {
    'nvim-lualine/lualine.nvim',
    requires = { 'kyazdani42/nvim-web-devicons', opt = true }
  }

  -- Hop
  use {
    'phaazon/hop.nvim',
    branch = 'v2', -- optional but strongly recommended
    config = function()
      -- you can configure Hop the way you like here; see :h hop-config
      require'hop'.setup { keys = 'etovxqpdygfblzhckisuran' }
    end
  }

  -- Reload packer
  if packer_bootstrap then
    require('packer').sync()
  end
end)
