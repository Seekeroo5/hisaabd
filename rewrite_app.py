import re

with open("src/App.tsx", "r") as f:
    content = f.read()

# Replace imports
imports = """import { useEffect, useMemo, useState } from "react";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from "@clerk/react";
import { id } from "@instantdb/react";
import { db } from "./db";
import "./App.css";"""

# Replace LedgerApp component
ledger_app = """
function LedgerApp() {
  const { user } = db.useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    const migrated = localStorage.getItem("dailytally.migrated");
    if (migrated) return;

    const legacyCurrencyStr = localStorage.getItem("dailytally.currency");
    const legacyLedgerStr = localStorage.getItem("dailytally.ledger");

    if (legacyCurrencyStr || legacyLedgerStr) {
      const txs = [];
      if (legacyCurrencyStr) {
        txs.push(db.tx.preferences[id()].update({
          currency: legacyCurrencyStr,
          creatorId: userId
        }));
      }

      if (legacyLedgerStr) {
        try {
          const parsed = JSON.parse(legacyLedgerStr);
          if (parsed.date && Array.isArray(parsed.entries)) {
            const ledgerId = id();
            txs.push(db.tx.ledgers[ledgerId].update({
              date: parsed.date,
              copied: false,
              creatorId: userId
            }));
            parsed.entries.forEach((e: any, index: number) => {
               if (e && e.type && typeof e.amount === "number") {
                  txs.push(db.tx.entries[e.id || id()].update({
                    type: e.type,
                    amount: e.amount,
                    orderIndex: index,
                    creatorId: userId
                  }).link({ ledgers: ledgerId }));
               }
            });
          }
        } catch (e) {}
      }

      if (txs.length > 0) {
        db.transact(txs);
      }
      localStorage.setItem("dailytally.migrated", "true");
    }
  }, [userId]);

  const { data, isLoading } = db.useQuery({
    preferences: {
      $: {
        where: { creatorId: userId },
      },
    },
    ledgers: {
      $: {
        where: { creatorId: userId },
      },
      entries: {},
    },
  });

  const [draftSide, setDraftSide] = useState<"income" | "expense" | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(
    null,
  );

  const today = todayKey();

  const preference = data?.preferences?.[0];
  const currencySymbol = preference?.currency;
  const currency = CURRENCIES.find((c) => c.symbol === currencySymbol) ?? null;

  const allLedgers = data?.ledgers || [];

  const todayLedger = allLedgers.find((l) => l.date === today);

  const pastLedgers = allLedgers.filter((l) => l.date < today && !l.copied && (l.entries?.length || 0) > 0);
  pastLedgers.sort((a, b) => b.date.localeCompare(a.date));
  const staleLedger = pastLedgers.length > 0 ? pastLedgers[0] : null;

  useEffect(() => {
    if (!isLoading && userId && !staleLedger && !todayLedger) {
      db.transact([
        db.tx.ledgers[id()].update({
          date: today,
          copied: false,
          creatorId: userId
        })
      ]);
    }
  }, [isLoading, userId, staleLedger, todayLedger, today]);

  const rawEntries = todayLedger?.entries || [];
  const entries = useMemo(() => {
    return [...rawEntries]
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
      .map(e => ({
        id: e.id,
        type: e.type as "income" | "expense",
        amount: e.amount,
      }));
  }, [rawEntries]);

  const balances = useMemo(
    () => getRunningBalances(entries),
    [entries],
  );
  const displayBalances = useMemo(
    () => getDisplayBalances(entries),
    [entries],
  );
  const draftDisplayBalance = useMemo(
    () => getDraftDisplayBalance(entries),
    [entries],
  );

  const selectCurrency = (selectedCurrency: Currency) => {
    if (!userId) return;
    if (preference) {
      db.transact([
        db.tx.preferences[preference.id].update({ currency: selectedCurrency.symbol })
      ]);
    } else {
      db.transact([
        db.tx.preferences[id()].update({ currency: selectedCurrency.symbol, creatorId: userId })
      ]);
    }
  };

  const updateLedgerEntries = (newEntries: LedgerEntry[], ledgerId: string) => {
    if (!userId) return;
    const normalized = normalizeLedgerEntries(newEntries);

    const txs = normalized.map((entry, index) => {
      return db.tx.entries[entry.id || id()].update({
        type: entry.type,
        amount: entry.amount,
        orderIndex: index,
        creatorId: userId
      }).link({ ledgers: ledgerId });
    });

    db.transact(txs);
  };

  const commitDraft = () => {
    const amount = parsePositiveNumber(draftValue);
    const currentBalance = balances.at(-1) ?? 0;

    if (
      !draftSide ||
      !amount ||
      (draftSide === "expense" && amount > currentBalance)
    ) {
      setDraftSide(null);
      setDraftValue("");
      return;
    }

    if (!todayLedger) return;

    updateLedgerEntries([
      ...entries,
      {
        id: id(),
        type: draftSide,
        amount,
      },
    ], todayLedger.id);

    setDraftSide(null);
    setDraftValue("");
  };

  const commitEdit = (entryId: string) => {
    const entryIndex = entries.findIndex(
      (entry) => entry.id === entryId,
    );
    const entry = entries[entryIndex];
    const amount = parseZeroOrPositiveNumber(editing?.value ?? "");

    if (!entry) {
      setEditing(null);
      return;
    }

    const balanceBeforeEntry = entryIndex === 0 ? 0 : balances[entryIndex - 1];
    const nextAmount =
      entry.type === "expense" && amount > balanceBeforeEntry ? 0 : amount;

    if (!todayLedger) return;

    updateLedgerEntries(
      entries.map((e) =>
        e.id === entryId ? { ...e, amount: nextAmount } : e,
      ),
      todayLedger.id
    );

    setEditing(null);
  };

  const handleMainCopy = () => {
    if (!currency || !todayLedger) return;
    void copyText(buildLedgerText(entries, currency));
  };

  const handleWarningCopy = async () => {
    if (!currency || !staleLedger) return;

    const staleEntries = [...(staleLedger.entries || [])]
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
      .map(e => ({
        id: e.id,
        type: e.type as "income" | "expense",
        amount: e.amount,
      }));

    const didCopy = await copyText(
      buildLedgerText(staleEntries, currency),
    );
    if (!didCopy) return;

    db.transact([
      db.tx.ledgers[staleLedger.id].update({ copied: true })
    ]);
  };

  if (isLoading) {
    return (
      <main className="ledger-screen" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: "1.2rem", color: "var(--copy)" }}>
          Loading your data...
        </p>
      </main>
    );
  }

  if (!currency) {
    return (
      <main className="currency-screen" aria-label="Choose currency">
        <div className="currency-buttons">
          {CURRENCIES.map((currencyOption) => (
            <button
              className="currency-button"
              key={currencyOption.symbol}
              type="button"
              onClick={() => selectCurrency(currencyOption)}
              aria-label={`Use ${currencyOption.symbol}`}
            >
              {currencyOption.symbol}
            </button>
          ))}
        </div>
      </main>
    );
  }

  if (staleLedger) {
    return (
      <main className="warning-screen">
        <section className="warning-panel" aria-live="assertive">
          <h1>Warning</h1>
          <p>Yesterday's grind is over.</p>
          <p>Copy the ledger before today begins.</p>
          <button
            className="warning-copy"
            type="button"
            onClick={handleWarningCopy}
          >
            COPY
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="ledger-screen" aria-label="DailyTally ledger">
      <header className="ledger-header" aria-hidden="true">
        <span className="plus">+</span>
        <span className="xp">XP</span>
        <span className="minus">-</span>
      </header>

      <section className="ledger-rows">
        {entries.map((entry, index) => {
          const isEditing = editing?.id === entry.id;
          const displayValue = isEditing
            ? editing.value
            : formatAmount(entry.amount, currency);
          const balance = displayBalances[index];

          return (
            <div className="ledger-row" key={entry.id}>
              <div className="amount-cell amount-left">
                {entry.type === "income" ? (
                  <input
                    aria-label="Income"
                    className="amount-input income-input"
                    inputMode="decimal"
                    pattern="[0-9]*[.]?[0-9]*"
                    value={displayValue}
                    onFocus={() =>
                      setEditing({
                        id: entry.id,
                        value: rawAmount(entry.amount),
                      })
                    }
                    onChange={(event) =>
                      setEditing({
                        id: entry.id,
                        value: sanitizeNumberInput(event.target.value),
                      })
                    }
                    onBlur={() => commitEdit(entry.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                ) : null}
              </div>

              <div className="balance-cell">
                {formatAmount(balance, currency)}
              </div>

              <div className="amount-cell amount-right">
                {entry.type === "expense" ? (
                  <input
                    aria-label="Expense"
                    className="amount-input expense-input"
                    inputMode="decimal"
                    pattern="[0-9]*[.]?[0-9]*"
                    value={displayValue}
                    onFocus={() =>
                      setEditing({
                        id: entry.id,
                        value: rawAmount(entry.amount),
                      })
                    }
                    onChange={(event) =>
                      setEditing({
                        id: entry.id,
                        value: sanitizeNumberInput(event.target.value),
                      })
                    }
                    onBlur={() => commitEdit(entry.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                ) : null}
              </div>
            </div>
          );
        })}

        <div className="ledger-row draft-row">
          <div className="amount-cell amount-left">
            <input
              aria-label="New income"
              className="amount-input income-input draft-input"
              inputMode="decimal"
              pattern="[0-9]*[.]?[0-9]*"
              value={draftSide === "income" ? draftValue : "0"}
              disabled={draftSide === "expense" && draftValue.length > 0}
              onFocus={() => {
                setDraftSide("income");
                if (!draftValue) setDraftValue("");
              }}
              onChange={(event) => {
                setDraftSide("income");
                setDraftValue(sanitizeNumberInput(event.target.value));
              }}
              onBlur={commitDraft}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          </div>

          <div className="balance-cell draft-balance">
            {draftDisplayBalance === 0
              ? "0"
              : formatAmount(draftDisplayBalance, currency)}
          </div>

          <div className="amount-cell amount-right">
            <input
              aria-label="New expense"
              className="amount-input expense-input draft-input"
              inputMode="decimal"
              pattern="[0-9]*[.]?[0-9]*"
              value={draftSide === "expense" ? draftValue : "0"}
              disabled={draftSide === "income" && draftValue.length > 0}
              onFocus={() => {
                setDraftSide("expense");
                if (!draftValue) setDraftValue("");
              }}
              onChange={(event) => {
                setDraftSide("expense");
                setDraftValue(sanitizeNumberInput(event.target.value));
              }}
              onBlur={commitDraft}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          </div>
        </div>
      </section>

      <button
        aria-label="Copy ledger"
        className="copy-button"
        type="button"
        onClick={handleMainCopy}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M8 8.5A2.5 2.5 0 0 1 10.5 6H18a2.5 2.5 0 0 1 2.5 2.5V18a2.5 2.5 0 0 1-2.5 2.5h-7.5A2.5 2.5 0 0 1 8 18z" />
          <path d="M5.5 15.5A2.5 2.5 0 0 1 3 13V5.5A2.5 2.5 0 0 1 5.5 3H13a2.5 2.5 0 0 1 2.5 2.5" />
        </svg>
      </button>

      <div
        className="bottom-left-controls"
        style={{
          position: "fixed",
          left: "max(14px, env(safe-area-inset-left))",
          bottom: "max(20px, env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          alignItems: "flex-start",
        }}
      >
        <time
          className="daily-date"
          dateTime={todayLedger?.date || today}
          aria-label={`Ledger date ${formatDisplayDate(todayLedger?.date || today)}`}
        >
          {formatDisplayDate(todayLedger?.date || today)}
        </time>
        <UserButton />
      </div>
    </main>
  );
}
"""

with open("src/App.tsx", "w") as f:
    f.write(imports + "\n\n")
    # Actually, let's read the git version to be safe, because I corrupted the file!
    import subprocess

    content = subprocess.check_output(["git", "show", "HEAD:src/App.tsx"]).decode(
        "utf-8"
    )

    start_type = content.find("type Currency = {")
    end_copyText = content.find("function LedgerApp() {")

    middle = content[start_type:end_copyText]

    middle = re.sub(r"type SavedLedger = \{[^}]*\};", "", middle, flags=re.MULTILINE)
    middle = re.sub(r'const CURRENCY_KEY = "[^"]*";', "", middle)
    middle = re.sub(r'const LEDGER_KEY = "[^"]*";', "", middle)

    middle = re.sub(
        r"const getInitialStorageState = \(\): \{.*?return \{ ledger: saved, staleLedger: null \};\n\n?};",
        "",
        middle,
        flags=re.MULTILINE | re.DOTALL,
    )

    middle = re.sub(
        r"const parseSavedLedger = \(\): SavedLedger \| null => \{.*?\} catch \{\n    return null;\n  \}\n\n?};",
        "",
        middle,
        flags=re.MULTILINE | re.DOTALL,
    )

    middle = re.sub(
        r"const loadCurrency = \(\): Currency \| null => \{.*?\n\n?};",
        "",
        middle,
        flags=re.MULTILINE | re.DOTALL,
    )

    middle = re.sub(
        r"const saveLedger = \(ledger: SavedLedger\) => \{.*?\n\n?};",
        "",
        middle,
        flags=re.MULTILINE | re.DOTALL,
    )

    middle = re.sub(
        r"const makeEmptyLedger = \(\)[^;]+;",
        "",
        middle,
        flags=re.MULTILINE | re.DOTALL,
    )
    middle = re.sub(
        r"const makeEmptyLedger = \(\) => \(\{[^}]*\}\);",
        "",
        middle,
        flags=re.MULTILINE | re.DOTALL,
    )

    f.write(middle.strip() + "\n\n")
    f.write(ledger_app + "\n\n")

    start_app = content.find("function App() {")
    f.write(content[start_app:])
