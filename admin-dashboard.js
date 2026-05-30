import { init } from "@instantdb/admin";
import inquirer from "inquirer";
import chalk from "chalk";

// Initialize with provisioned credentials
const db = init({
  appId: "e9d23170-74ee-4b98-bb2f-16b982d711c9",
  adminToken: "26c9cd00-2a8d-4e3b-9630-264e3d1ac2eb",
});

async function fetchUsers() {
  const result = await db.query({ $users: {} });
  return result.$users;
}

async function fetchUserLedgers(userId) {
  const result = await db.query({
    ledgers: {
      $: {
        where: {
          creatorId: userId,
        },
      },
      entries: {},
    },
    preferences: {
      $: {
        where: {
          creatorId: userId,
        },
      },
    },
  });
  return result;
}

async function viewUserData() {
  const users = await fetchUsers();

  if (users.length === 0) {
    console.log(chalk.yellow("\nNo users found in the database."));
    return;
  }

  const { selectedUser } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedUser",
      message: "Select a user to view their data:",
      choices: users.map(u => ({
        name: `${u.email || "Unknown Email"} (ID: ${u.id})`,
        value: u.id,
      })),
    },
  ]);

  const data = await fetchUserLedgers(selectedUser);
  console.log(chalk.green(`\n--- Data for User ${selectedUser} ---`));
  console.log(chalk.cyan("Preferences:"));
  console.log(JSON.stringify(data.preferences, null, 2));
  console.log(chalk.cyan("\nLedgers & Entries:"));
  console.log(JSON.stringify(data.ledgers, null, 2));
  console.log(chalk.green("----------------------------------\n"));
}

async function updateUserData() {
  const users = await fetchUsers();

  if (users.length === 0) {
    console.log(chalk.yellow("\nNo users found in the database."));
    return;
  }

  const { selectedUser } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedUser",
      message: "Select a user to modify their data:",
      choices: users.map(u => ({
        name: `${u.email || "Unknown Email"} (ID: ${u.id})`,
        value: u.id,
      })),
    },
  ]);

  const data = await fetchUserLedgers(selectedUser);

  if (data.preferences.length === 0 && data.ledgers.length === 0) {
    console.log(chalk.yellow("\nUser has no preferences or ledgers to update."));
    return;
  }

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What would you like to update?",
      choices: [
        { name: "Update Currency Preference", value: "currency" },
        { name: "Modify a Ledger Entry Amount", value: "entry" },
      ],
    },
  ]);

  if (action === "currency") {
    if (data.preferences.length === 0) {
      console.log(chalk.red("No preferences record found for this user."));
      return;
    }
    const prefId = data.preferences[0].id;
    const { newCurrency } = await inquirer.prompt([
      {
        type: "input",
        name: "newCurrency",
        message: "Enter the new currency symbol (e.g. $, ₹, €):",
      },
    ]);

    await db.transact(db.tx.preferences[prefId].update({ currency: newCurrency }));
    console.log(chalk.green(`\nSuccessfully updated currency to ${newCurrency}!`));
  } else if (action === "entry") {
    const entries = data.ledgers.flatMap(l => l.entries);
    if (entries.length === 0) {
      console.log(chalk.red("No entries found for this user."));
      return;
    }

    const { selectedEntry } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedEntry",
        message: "Select an entry to update:",
        choices: entries.map(e => ({
          name: `${e.type.toUpperCase()}: ${e.amount} (ID: ${e.id})`,
          value: e,
        })),
      },
    ]);

    const { newAmount } = await inquirer.prompt([
      {
        type: "number",
        name: "newAmount",
        message: `Enter new amount for ${selectedEntry.type} (current: ${selectedEntry.amount}):`,
      },
    ]);

    if (isNaN(newAmount)) {
       console.log(chalk.red("Invalid amount."));
       return;
    }

    await db.transact(db.tx.entries[selectedEntry.id].update({ amount: newAmount }));
    console.log(chalk.green(`\nSuccessfully updated entry amount to ${newAmount}!`));
  }
}

async function deleteUserData() {
  const users = await fetchUsers();

  if (users.length === 0) {
    console.log(chalk.yellow("\nNo users found in the database."));
    return;
  }

  const { selectedUser } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedUser",
      message: "Select a user to delete their data:",
      choices: users.map(u => ({
        name: `${u.email || "Unknown Email"} (ID: ${u.id})`,
        value: u.id,
      })),
    },
  ]);

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: chalk.red(`Are you SURE you want to delete ALL data for user ${selectedUser}?`),
      default: false,
    },
  ]);

  if (confirm) {
    const data = await fetchUserLedgers(selectedUser);
    const txs = [];

    // Delete preferences
    data.preferences.forEach(p => txs.push(db.tx.preferences[p.id].delete()));
    // Delete ledgers (entries cascade if setup, but we'll do it explicitly to be safe)
    data.ledgers.forEach(l => {
      l.entries.forEach(e => txs.push(db.tx.entries[e.id].delete()));
      txs.push(db.tx.ledgers[l.id].delete());
    });

    if (txs.length > 0) {
      await db.transact(txs);
      console.log(chalk.green(`\nDeleted ${txs.length} records for user ${selectedUser}.`));
    } else {
      console.log(chalk.yellow("\nNo data found to delete."));
    }
  }
}

async function mainMenu() {
  console.log(chalk.blue.bold("\n=== InstantDB Admin Dashboard ==="));
  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: "What would you like to do?",
      choices: [
        { name: "View User Data", value: "view" },
        { name: "Update User Data", value: "update" },
        { name: "Delete User Data", value: "delete" },
        { name: "Exit", value: "exit" },
      ],
    },
  ]);

  try {
    switch (choice) {
      case "view":
        await viewUserData();
        break;
      case "update":
        await updateUserData();
        break;
      case "delete":
        await deleteUserData();
        break;
      case "exit":
        console.log("Goodbye!");
        process.exit(0);
    }
  } catch (error) {
    console.error(chalk.red("\nAn error occurred:"), error.message);
  }

  // Loop back
  if (choice !== "exit") {
    await mainMenu();
  }
}

mainMenu();
