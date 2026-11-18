local M = {}

local MARKERS = { '.obsidian', '.marksman.toml' }

local function find(file, name)
  local root = vim.fs.root(file, MARKERS)
  if not root then
    return nil
  end

  local function is_match(candidate, directory)
    local hidden = directory:find('/%.', #root + 1)
    return candidate == name and not hidden
  end

  return vim.fs.find(is_match, { path = root, type = 'file', limit = 1 })[1]
end

function M.resolve(file, source)
  source = source:gsub('[|#].*$', '')

  local nearby = vim.fs.joinpath(vim.fs.dirname(file), source)
  local path = find(file, vim.fs.basename(source)) or nearby
  return vim.uv.fs_stat(path) and path or nil
end

local function embed_under_cursor()
  local line = vim.api.nvim_get_current_line()
  local column = vim.api.nvim_win_get_cursor(0)[2] + 1
  local first

  for _, pattern in ipairs({ '()!%[%[(.-)%]%]()', '()!%[.-%]%((.-)%)()' }) do
    for start, source, finish in line:gmatch(pattern) do
      first = first or source
      if column >= start and column < finish then
        return source
      end
    end
  end

  return first
end

function M.open_embed()
  local source = embed_under_cursor()
  if not source then
    vim.notify('No embed on this line', vim.log.levels.WARN)
    return
  end

  local path = M.resolve(vim.api.nvim_buf_get_name(0), source)
  if not path then
    vim.notify('Embed not found: ' .. source, vim.log.levels.WARN)
    return
  end

  vim.ui.open(path)
end

function M.open_in_obsidian()
  local file = vim.api.nvim_buf_get_name(0)
  if not vim.fs.root(file, MARKERS) then
    vim.notify('Not a note in a vault', vim.log.levels.WARN)
    return
  end

  vim.ui.open('obsidian://open?path=' .. vim.uri_encode(file, 'rfc2396'))
end

return M
