import { useEffect, useMemo, useState } from "react";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/react";
import "./App.css";

type Currency = {
  symbol: string;
  decimals: number;
};

type LedgerEntry = {
  id: string;
  type: "income" | "expense";
  amount: number;
};

type SavedLedger = {
  date: string;
  entries: LedgerEntry[];
};

const CURRENCIES: Currency[] = [
  { symbol: "₹", decimals: 2 },
  { symbol: "$", decimals: 2 },
  { symbol: "€", decimals: 2 },
  { symbol: "£", decimals: 2 },
  { symbol: "¥", decimals: 2 },
  { symbol: "₿", decimals: 8 },
];

const CURRENCY_KEY = "dailytally.currency";
const LEDGER_KEY = "dailytally.ledger";
const COLUMN_WIDTH = 18;

const todayKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const makeEmptyLedger = (): SavedLedger => ({
  date: todayKey(),
  entries: [],
});

const getInitialStorageState = (): {
  ledger: SavedLedger;
  staleLedger: SavedLedger | null;
} => {
  const saved = parseSavedLedger();
  const today = todayKey();

  if (!saved) {
    const fresh = makeEmptyLedger();
    saveLedger(fresh);
    return { ledger: fresh, staleLedger: null };
  }

  if (saved.date < today) {
    if (saved.entries.length > 0) {
      return { ledger: saved, staleLedger: saved };
    }

    const fresh = makeEmptyLedger();
    saveLedger(fresh);
    return { ledger: fresh, staleLedger: null };
  }

  if (saved.date > today) {
    const fresh = makeEmptyLedger();
    saveLedger(fresh);
    return { ledger: fresh, staleLedger: null };
  }

  return { ledger: saved, staleLedger: null };
};

const parseSavedLedger = (): SavedLedger | null => {
  const saved = localStorage.getItem(LEDGER_KEY);

  if (!saved) return null;

  try {
    const ledger = JSON.parse(saved) as SavedLedger;
    if (!ledger.date || !Array.isArray(ledger.entries)) return null;

    return {
      date: ledger.date,
      entries: ledger.entries.filter(
        (entry) =>
          entry &&
          typeof entry.id === "string" &&
          (entry.type === "income" || entry.type === "expense") &&
          Number.isFinite(entry.amount) &&
          entry.amount >= 0,
      ),
    };
  } catch {
    return null;
  }
};

const loadCurrency = (): Currency | null => {
  const symbol = localStorage.getItem(CURRENCY_KEY);
  return CURRENCIES.find((currency) => currency.symbol === symbol) ?? null;
};

const saveLedger = (ledger: SavedLedger) => {
  localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
};

const sanitizeNumberInput = (value: string) => {
  const normalized = value.replaceAll(",", ".");
  let seenDecimal = false;

  return Array.from(normalized)
    .filter((character) => {
      if (character >= "0" && character <= "9") return true;
      if (character === "." && !seenDecimal) {
        seenDecimal = true;
        return true;
      }

      return false;
    })
    .join("");
};

const parsePositiveNumber = (value: string) => {
  if (!value || value === ".") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseZeroOrPositiveNumber = (value: string) => {
  if (!value || value === ".") return 0;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const rawAmount = (amount: number) => {
  const fixed = amount.toFixed(8);
  return fixed.replace(/\.?0+$/, "");
};

const formatAmount = (amount: number, currency: Currency) =>
  `${currency.symbol}${amount.toFixed(currency.decimals)}`;

const formatDisplayDate = (date: string) => {
  const [year, month, day] = date.split("-");

  if (!year || !month || !day) return date;

  return `${day}/${month}/${year}`;
};

const centerText = (value: string, width: number) => {
  if (value.length >= width) return value;

  const left = Math.floor((width - value.length) / 2);
  const right = width - value.length - left;

  return `${" ".repeat(left)}${value}${" ".repeat(right)}`;
};

const formatCopyLine = (left: string, center: string, right: string) =>
  `${left.padEnd(COLUMN_WIDTH)}${centerText(center, COLUMN_WIDTH)}${right.padStart(
    COLUMN_WIDTH,
  )}`.trimEnd();

const getRunningBalances = (entries: LedgerEntry[]) => {
  return entries.reduce<number[]>((values, entry, index) => {
    const previousBalance = index === 0 ? 0 : values[index - 1];
    const nextBalance =
      previousBalance +
      (entry.type === "income" ? entry.amount : -entry.amount);

    return [...values, nextBalance];
  }, []);
};

const getDisplayBalances = (entries: LedgerEntry[]) => {
  let displayBalance = 0;
  let pendingExpense = 0;

  return entries.map((entry) => {
    displayBalance -= pendingExpense;
    pendingExpense = 0;

    if (entry.type === "income") {
      displayBalance += entry.amount;
      return displayBalance;
    }

    pendingExpense = entry.amount;
    return displayBalance;
  });
};

const getDraftDisplayBalance = (entries: LedgerEntry[]) => {
  if (entries.at(-1)?.type !== "expense") return 0;

  return getRunningBalances(entries).at(-1) ?? 0;
};

const normalizeLedgerEntries = (entries: LedgerEntry[]) => {
  let balance = 0;

  return entries.map((entry) => {
    if (entry.type === "income") {
      balance += entry.amount;
      return entry;
    }

    if (entry.amount <= balance) {
      balance -= entry.amount;
      return entry;
    }

    return {
      ...entry,
      amount: 0,
    };
  });
};

const buildLedgerText = (entries: LedgerEntry[], currency: Currency) => {
  const lines = [formatCopyLine("+", "XP", "-")];
  const displayBalances = getDisplayBalances(entries);

  entries.forEach((entry, index) => {
    lines.push(
      formatCopyLine(
        entry.type === "income" ? formatAmount(entry.amount, currency) : "",
        formatAmount(displayBalances[index], currency),
        entry.type === "expense" ? formatAmount(entry.amount, currency) : "",
      ),
    );
  });

  return lines.join("\n");
};

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const didCopy = document.execCommand("copy");
    document.body.removeChild(input);

    return didCopy;
  }
};

function App() {
  const [currency, setCurrency] = useState<Currency | null>(() =>
    loadCurrency(),
  );
  const [{ ledger, staleLedger }, setStorageState] = useState(
    getInitialStorageState,
  );
  const [draftSide, setDraftSide] = useState<"income" | "expense" | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(
    null,
  );

  useEffect(() => {
    if (!staleLedger && currency) {
      saveLedger(ledger);
    }
  }, [currency, ledger, staleLedger]);

  const balances = useMemo(
    () => getRunningBalances(ledger.entries),
    [ledger.entries],
  );
  const displayBalances = useMemo(
    () => getDisplayBalances(ledger.entries),
    [ledger.entries],
  );
  const draftDisplayBalance = useMemo(
    () => getDraftDisplayBalance(ledger.entries),
    [ledger.entries],
  );

  const selectCurrency = (selectedCurrency: Currency) => {
    localStorage.setItem(CURRENCY_KEY, selectedCurrency.symbol);
    setCurrency(selectedCurrency);
  };

  const updateLedgerEntries = (entries: LedgerEntry[]) => {
    setStorageState((current) => ({
      ...current,
      ledger: {
        date: todayKey(),
        entries: normalizeLedgerEntries(entries),
      },
    }));
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

    updateLedgerEntries([
      ...ledger.entries,
      {
        id: `${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
        type: draftSide,
        amount,
      },
    ]);
    setDraftSide(null);
    setDraftValue("");
  };

  const commitEdit = (entryId: string) => {
    const entryIndex = ledger.entries.findIndex(
      (entry) => entry.id === entryId,
    );
    const entry = ledger.entries[entryIndex];
    const amount = parseZeroOrPositiveNumber(editing?.value ?? "");

    if (!entry) {
      setEditing(null);
      return;
    }

    const balanceBeforeEntry = entryIndex === 0 ? 0 : balances[entryIndex - 1];
    const nextAmount =
      entry.type === "expense" && amount > balanceBeforeEntry ? 0 : amount;

    updateLedgerEntries(
      ledger.entries.map((entry) =>
        entry.id === entryId ? { ...entry, amount: nextAmount } : entry,
      ),
    );

    setEditing(null);
  };

  const handleMainCopy = () => {
    if (!currency) return;
    void copyText(buildLedgerText(ledger.entries, currency));
  };

  const handleWarningCopy = async () => {
    if (!currency || !staleLedger) return;

    const didCopy = await copyText(
      buildLedgerText(staleLedger.entries, currency),
    );
    if (!didCopy) return;

    const fresh = makeEmptyLedger();
    setStorageState({ ledger: fresh, staleLedger: null });
    saveLedger(fresh);
  };

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
    <>
      <header
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "1rem",
          position: "absolute",
          top: 0,
          right: 0,
          zIndex: 10,
        }}
      >
        <Show when="signed-out">
          <SignInButton />
          <SignUpButton />
        </Show>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </header>
      <main className="ledger-screen" aria-label="DailyTally ledger">
        <header className="ledger-header" aria-hidden="true">
          <span className="plus">+</span>
          <span className="xp">XP</span>
          <span className="minus">-</span>
        </header>

        <section className="ledger-rows">
          {ledger.entries.map((entry, index) => {
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

        <time
          className="daily-date"
          dateTime={ledger.date}
          aria-label={`Ledger date ${formatDisplayDate(ledger.date)}`}
        >
          {formatDisplayDate(ledger.date)}
        </time>
      </main>
    </>
  );
}

export default App;
