import { init } from "@instantdb/admin";

// Initialize with your provisioned credentials
const db = init({
  appId: "e9d23170-74ee-4b98-bb2f-16b982d711c9",
  adminToken: "26c9cd00-2a8d-4e3b-9630-264e3d1ac2eb",
});

async function runAdmin() {
  console.log("Fetching all data...");
  
  // 1. View all Ledgers and Entries
  const data = await db.query({
    preferences: {},
    ledgers: { entries: {} }
  });
  
  console.log(JSON.stringify(data, null, 2));

  // --- EXAMPLES OF HOW TO MODIFY DATA ---
  
  // 2. To delete a specific entry, uncomment the line below and replace 'ENTRY_ID_HERE':
  // await db.transact(db.tx.entries['ENTRY_ID_HERE'].delete());
  // console.log("Entry deleted!");

  // 3. To update an entry's amount:
  // await db.transact(db.tx.entries['ENTRY_ID_HERE'].update({ amount: 999 }));
  // console.log("Entry updated!");
}

runAdmin();
