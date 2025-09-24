-- Minimal AO runtime mocks for unit testing (fresh, deduped)
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
  _failRules = {},
  emit = function(event, payload)
    table.insert(ao.emitted, { event = event, payload = payload })
  end,
  send = function(msg)
    if ao._failRules and #ao._failRules > 0 then
      for _, rule in ipairs(ao._failRules) do
        local ok, shouldFail = pcall(rule, msg)
        if ok and shouldFail then error('Simulated send failure') end
      end
    end
    table.insert(ao.sent, msg)
    return true
  end,
  addFailRule = function(rule)
    table.insert(ao._failRules, rule)
  end,
  clearFailRules = function()
    ao._failRules = {}
  end
}

-- Simple JSON shim for tests
local jsonMock = {
  encode = function(tbl)
    local ok, cjson = pcall(require, 'cjson')
    if ok and cjson then return cjson.encode(tbl) end
    if type(tbl) == 'table' then
      local first = true
      local parts = { '{' }
      for k, v in pairs(tbl) do
        if not first then table.insert(parts, ',') end
        first = false
        table.insert(parts, string.format('\"%s\":\"%s\"', tostring(k), tostring(v)))
      end
      table.insert(parts, '}')
      return table.concat(parts)
    end
    return tostring(tbl)
  end,
  decode = function(str)
    local ok, cjson = pcall(require, 'cjson')
    if ok and cjson then return cjson.decode(str) end
    error('json.decode not available without cjson in mock')
  end
}

package.preload['json'] = function() return jsonMock end
