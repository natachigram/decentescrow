Here’s a detailed **README / integration guide** you can give your backend dev so they know exactly what to do to integrate with your `escrow.lua` process on AO. It will cover prerequisites, setup, code examples, error handling, and testing.

---

# Backend Integration README for Escrow Process on AO

> It describes how to send messages, read state, handle responses/events, and do testing.

---

## 🧩 Prerequisites

Before integrating, ensure you have:

1. **Process ID**
   You already deployed your `escrow.lua`. You should know its Process ID. Example:

   ```
   vI32TbLleCM8kk5s3MChwdVz9qfIJZ07U3Yfl5fEuw0
   ```

2. **Wallet / Signer**
   A JSON keyfile (or other AO wallet format) that has permissions / funds and will act as `msg.From` when sending messages. This acts like `msg.sender` in Solidity. Must be kept secure.

3. **Endpoints (RPC / AO-connect / gateway / mu / cu)**
   Know the AO network environment (testnet or mainnet), and the URLs for:

   * `mu` (Message unit)
   * `cu` (Compute unit)
   * Gateway (Arweave gateway, if needed).
   * Any SDK config for AO connect.

4. **SDK / Library**
   Use `@permaweb/aoconnect` (or equivalent) in Node.js / TypeScript, which provides APIs to send messages to processes, create signers, etc.
   You need code for reading files, handling tags, reading responses, listening to events.

---

##  Integration: 

Here are the required actions the backend will have to perform, with code skeletons, for each type of interaction with the escrow process.

### 1. Initialization & Configuration

* **InitOwner**: Only run this once, after deployment, to set the `Owner` state in `escrow.lua`.
* **SetConfig**: Configure parameters: platform fee (bps), treasury address, arbiter address, timeout seconds, allowed tokens, default token, etc.

#### Sample code (Node.js / TypeScript) using AO-Connect

```js
import { readFileSync } from "fs";
import { message, createDataItemSigner } from "@permaweb/aoconnect";

const wallet = JSON.parse(
  readFileSync("path/to/your/wallet.json").toString()
);
const signer = createDataItemSigner(wallet);
const PROCESS_ID = "vI32TbLleCM8kk5s3MChwdVz9qfIJZ07U3Yfl5fEuw0";

async function initProcessConfig() {
  // 1. InitOwner
  let resp = await message({
    process: PROCESS_ID,
    signer,
    tags: [
      { name: "Action", value: "InitOwner" }
    ],
    // No additional fields needed unless  handler expects them
    data: ""  
  });
  console.log("InitOwner message id:", resp);

  // 2. SetConfig
  resp = await message({
    process: PROCESS_ID,
    signer,
    tags: [
      { name: "Action", value: "SetConfig" },
      { name: "platformFeeBps", value: "200" },            // example: 2%
      { name: "platformTreasury", value: "YOUR_TREASURY_ADDRESS" },
      { name: "arbiter", value: "ARB_ADDRESS_IF_ANY" },
      { name: "timeoutSecs", value: "86400" }               // example: 24 hours
      // If your contract allows tags for allowedTokens or defaultToken, include those
      // { name: "allowedToken", value: "SOME_TOKEN_ID" }
    ],
    data: ""  
  });
  console.log("SetConfig message id:", resp);
}

initProcessConfig().catch(console.error);
```

After that, it’s good to check that the `Owner` and config are set correctly via view calls (see below).

---

### 2. Client-Action Message Sending

For actions like deposit, assign freelanc­er, release, refund, open dispute, decide dispute, claim timeout, cancel, etc., the backend will call appropriate message sends, using `@permaweb/aoconnect`.

#### Example: Deposit

```js
async function depositJob(jobId, clientAddress, tokenId, amount, meta) {
  const resp = await message({
    process: PROCESS_ID,
    signer,                  // this signer must match msg.From = clientAddress
    tags: [
      { name: "Action", value: "Deposit" },
      { name: "jobId", value: jobId },
      { name: "client", value: clientAddress },
      { name: "token", value: tokenId },
      { name: "amount", value: amount.toString() }
    ],
    data: JSON.stringify({ meta })  // optional metadata as object
  });
  return resp;  // message ID or error
}
```

Other actions use similar patterns. Use the `Action` tag matching the handlers in `escrow.lua`:

| Action                                       | Required Tags / Fields                     |
| -------------------------------------------- | ------------------------------------------ |
| AssignFreelancer                             | `jobId`, `freelancer`                      |
| Release                                      | `jobId` (From must be client)              |
| Refund                                       | `jobId`                                    |
| CancelUnassigned                             | `jobId`                                    |
| OpenDispute                                  | `jobId`, `reason`                          |
| DecideDispute                                | `jobId`, `outcome` (“release” or “refund”) |
| ClaimTimeout                                 | `jobId`                                    |
| Pause / Unpause                              | none extra (From must be Owner)            |
| AllowToken / DisallowToken / SetDefaultToken | `token` field                              |
| TransferOwnership                            | `newOwner`                                 |
| AdminResetJob                                | `jobId`                                    |

---

### 3. View / Read State

To display job status, list jobs, see pending balances etc., backend needs to call view handlers and parse their responses.

Handlers in `escrow.lua` you’ll use:

* `GetConfig` → response tag `GetConfigResult` with data: `{ Owner, Paused, platformFeeBps, platformTreasury, arbiter, timeoutSecs }`
* `ListAllowedTokens` → `ListAllowedTokensResult`
* `ListJobs` → `ListJobsResult` (takes optional `limit`)
* `GetJob` → `GetJobResult` (with `jobId`, returns full job object or `{}`)
* `GetPending` → `GetPendingResult` (with address or use `msg.From`)
* Possibly `Claim` you’ll observe pending balances etc.

#### Example:

```js
import { readFileSync } from "fs";
import { view, createDataItemSigner } from "@permaweb/aoconnect";

const wallet = JSON.parse(readFileSync("path/to/wallet.json"));
const signer = createDataItemSigner(wallet);

async function getJob(jobId) {
  const resp = await view({
    process: PROCESS_ID,
    signer,  // sometimes view calls can be unsigned depending on AO config, but safer to sign
    tags: [
      { name: "Action", value: "GetJob" },
      { name: "jobId", value: jobId }
    ],
    data: ""  
  });
  // resp.Data will have JSON encoded job object
  console.log("GetJobResult:", resp);
  return JSON.parse(resp.Data);
}
```

*Backend can then send this to frontend API routes etc.*

---

### 4. Event / Emitted Logs Handling

Every time a state-changing action is done (Deposit, Release, etc.), the contract emits events via `emit(event, data)` using `ao.emit(...)`.


* Listen for those events in backend or use polling if subscription not available.
* Use events to update database, trigger notifications, etc.
* Typical events you’ll see (check your escrow code):
  `"Deposited"`, `"FreelancerAssigned"`, `"Released"`, `"Refunded"`, `"DisputeOpened"`, `"TokenAllowed"`, etc.

---

## 🔧 Error Handling & Edge Cases

Backend must handle:

* Errors when sending messages: invalid tags, missing required field, unauthorized `From`.
* Token transfer failures: `TransferFrom` or `Transfer` may throw; your escrow code emits `TransferFailed`. Catch these and report to user / revert UI action.
* Underflows / invalid numbers: improper amount strings, non-digit strings, too large, job in wrong state.
* Make sure `jobId` uniqueness / reuse logic: if jobId exists and is not in final state, depositing with same ID should error.
* Timeout logic: ensure correct `assignedAt` and `timeoutSecs` handling.

---

