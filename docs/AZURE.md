# AgriHaven on Microsoft Azure

AgriHaven is built to run on Microsoft Azure. Azure does real work in the app, not just hosting:

| Azure service | What it does in AgriHaven | Code |
|---|---|---|
| **Azure Static Web Apps** | Hosts the app on Microsoft's global network, with HTTPS and automatic deploys from GitHub | `staticwebapp.config.json` |
| **Azure Functions** (managed by Static Web Apps) | Backend API: `/api/power` (35 years of NASA POWER), `/api/recent` (this season), `/api/soil` (SoilGrids), `/api/places` (place search), `/api/advisor` (Ask AgriHaven), `/api/health` | `api/src/functions/` |
| **Azure Blob Storage** | Saves every field's NASA record and soil profile as JSON, so repeat visits and demos load in ~1–2 s instead of 10–30 s, and keep working when NASA or SoilGrids are slow. It also remembers points with no soil data, so the next visit doesn't wait | `api/src/lib/cache.js` |
| **Azure OpenAI** (gpt-4o-mini) | **Ask AgriHaven**: farmers ask questions in plain English or Spanish. Answers are grounded only in the field's NASA-derived numbers (rotations, Water Certainty Rate, soil, 2050s projections) | `api/src/lib/advisor.js` |
| **Azure Maps** | Search-as-you-type place suggestions, with the key kept server-side | `api/src/functions/places.js` |

```
Browser ──► Azure Static Web Apps (site)
   │
   └──► Azure Functions /api ──► NASA POWER · ISRIC SoilGrids · Azure Maps · Azure OpenAI
                 │
                 └──► Azure Blob Storage (cached NASA + soil JSON)
NASA GIBS satellite tiles (MODIS, SMAP, NISAR, OPERA…) load directly in the browser.
```

Without Azure (for example on the Vercel mirror), the app detects that `/api/health` is missing and calls NASA directly, so it always works. On Azure it is faster, more reliable, and adds Ask AgriHaven.

**Verified:** `npm run test:api` runs 8 backend tests. The Blob Storage cache was tested against Azurite, Microsoft's official storage emulator: first request 2.3 s (fetched from NASA and saved), repeat request 0.2 s (cache hit, no NASA call). A full page load for a cached field dropped from ~28 s to 1.7 s.

---

## Set it up (about 15 minutes)

You need a free **Azure for Students** account: https://azure.microsoft.com/free/students (sign in with your school email; $100 credit, no credit card).

Create everything in one **resource group** (for example `agrihaven-rg`) and the same region (for example **East US 2**).

### 1. Storage account (for the NASA data cache)
1. Azure portal → **Storage accounts** → **Create**.
2. Name: e.g. `agrihavenstore` (lowercase, unique). Performance **Standard**, Redundancy **LRS**. **Review + create**.
3. Open it → **Security + networking → Access keys** → **Show** → copy **Connection string** (key1).

### 2. Azure OpenAI (for Ask AgriHaven)
1. Go to **Azure AI Foundry** (https://ai.azure.com), or in the portal search **Azure OpenAI** → **Create**.
2. Deploy the model **gpt-4o-mini** (Deployment name: `gpt-4o-mini`).
3. Copy the **endpoint** (looks like `https://<name>.openai.azure.com`) and a **key**.

If your subscription can't create Azure OpenAI, skip this step. Everything else still works, and the Ask AgriHaven card hides itself.

### 3. Azure Maps (for place search)
1. Portal → **Azure Maps Accounts** → **Create** → pricing tier **Gen2**.
2. Open it → **Settings → Authentication** → copy the **Primary Key**.

### 4. Static Web App (hosting + Azure Functions)
1. Portal → **Static Web Apps** → **Create**.
2. Plan type **Free**. Name `agrihaven`.
3. Deployment source **GitHub** → sign in → Organization `harishram5900`, Repository `NASA-space-apps`, Branch `main`.
4. Build details: Build preset **Custom**, **App location** `/`, **Api location** `api`, **Output location** *(leave empty)*.
5. **Review + create**. Azure adds a GitHub Actions workflow to the repo and deploys automatically (about 2–4 minutes; watch the repo's **Actions** tab).

### 5. Connect the services
Static Web App → **Settings → Environment variables** → add, then **Apply**:

| Name | Value |
|---|---|
| `AZURE_STORAGE_CONNECTION_STRING` | connection string from step 1 |
| `AZURE_OPENAI_ENDPOINT` | endpoint from step 2 |
| `AZURE_OPENAI_KEY` | key from step 2 |
| `AZURE_OPENAI_DEPLOYMENT` | `gpt-4o-mini` |
| `AZURE_MAPS_KEY` | key from step 3 |

### 6. Check it
- Open `https://<your-app>.azurestaticapps.net/api/health`. Every service you set up should be `true`.
- Open the site and pick a field. The loading screen shows **☁️ Microsoft Azure cloud: Served by Azure Functions**. Load the same field again and it says **Blob Storage cache hit**.
- **Data & method** shows the Azure architecture with a live status for each service. The footer says **Runs on Microsoft Azure**.
- **Field story** shows **💬 Ask AgriHaven** (Azure OpenAI).

**Before the demo:** open each preset field once, so its NASA data is already in Blob Storage and loads instantly in front of the judges.

## Run the Azure backend locally
```bash
cd api && npm install && cd ..
npm run test:api                 # backend tests
npm run azure:local              # site + Azure Functions handlers on http://localhost:4280
# optional real Blob Storage locally: npx azurite-blob --inMemoryPersistence
# then set AZURE_STORAGE_CONNECTION_STRING to Azurite's development connection string
```
Microsoft's official tooling (`func start` / `swa start`) also works with the `api/` folder as-is.

## Cost
Static Web Apps Free, Functions included, Blob Storage (a few MB), Azure Maps Gen2 free monthly allowance, and gpt-4o-mini (fractions of a cent per question) fit comfortably in the student credit. The advisor is rate-limited per user.
