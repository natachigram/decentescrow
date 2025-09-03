-- Minimal AO runtime mocks for unit testing
Handlers = {
  _handlers = {},
  add = function(name, predicate, fn)
    Handlers._handlers[name] = { pred = predicate, fn = fn }
  end,
  utils = {
    hasMatchingTag = function(key, val)
      return function(msg)
        return msg.Action == val
      end
    end
  }
}

ao = {
  id = 'ESCROW_PROCESS_ID',
  emitted = {},
  sent = {},
  emit = function(event, payload)
    table.insert(ao.emitted, { event = event, payload = payload })
  end,
  send = function(msg)
    table.insert(ao.sent, msg)
  end
}

-- Simple JSON shim for tests
local jsonMock = {
  encode = function(tbl)
    -- naive encoder for tests; not full JSON
    local ok, cjson = pcall(require, 'cjson')
    if ok and cjson then return cjson.encode(tbl) end
    -- fallback: very limited
    if type(tbl) == 'table' then
      local parts = {'{'}
      local first = true
      for k,v in pairs(tbl) do
        if not first then table.insert(parts, ',') end
        first = false
        table.insert(parts, string.format('\"%s\":\"%s\"', tostring(k), tostring(v)))
      end
      table.insert(parts, '}')
      return table.concat(parts)
    end
    return tostring(tbl)
  end
}

package.preload['json'] = function() return jsonMock end
