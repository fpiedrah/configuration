local function configuration()
  local mason = require('mason')
  local lspconfig = require('lspconfig')
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
    'clan',
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

  for _, lsp in ipairs(servers) do
    lspconfig[lsp].setup {
      capabilities = capabilities,
    }
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
