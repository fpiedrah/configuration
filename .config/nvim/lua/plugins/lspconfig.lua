local function configuration()
  local mason = require('mason')
  local mason_lspconfig = require('mason-lspconfig')

  mason.setup {
    ui = {
      icons = {
        package_installed = "✓",
        package_pending = "➜",
        package_uninstalled = "✗"
      }
    }
  }

  local servers = {
    'clangd',
    'dockerls',
    'jsonls',
    'julials',
    'lemminx',
    'ltex',
    'lua_ls',
    'marksman',
    'jedi_language_server',
    'rust_analyzer',
    'sqlls',
    'taplo',
    'tinymist',
    'yamlls',
    'zls',
  }

  mason_lspconfig.setup {
    ensure_installed = servers,
  }

  local capabilities = require('cmp_nvim_lsp').default_capabilities(
    vim.lsp.protocol.make_client_capabilities()
  )

  -- Changed this loop to use vim.lsp.config instead of lspconfig[lsp].setup
  for _, lsp in ipairs(servers) do
    vim.lsp.config(lsp, {
      capabilities = capabilities,
    })
  end
end

return {
  'neovim/nvim-lspconfig',
  dependencies = {
    'hrsh7th/cmp-nvim-lsp',
    'williamboman/mason.nvim',
    'williamboman/mason-lspconfig.nvim',
  },
  config = configuration,
}
