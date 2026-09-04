<script lang="ts">
  import { WORD_LENGTH, suggestWords } from '@arcade/cipher';

  interface Props {
    /** The word currently locked in on the server, if any. */
    current: string | null;
    error: string | null;
    shakeToken: number;
    busy?: boolean;
    onSubmit: (word: string) => Promise<boolean> | boolean;
    onRandom: () => void;
    onDismissError: () => void;
  }

  let { current, error, shakeToken, busy = false, onSubmit, onRandom, onDismissError }: Props =
    $props();

  let draft = $state('');
  let revealed = $state(false);

  const suggestions = $derived(
    draft.length >= 2 && draft.length < WORD_LENGTH ? suggestWords(draft, 6) : [],
  );

  async function commit(): Promise<void> {
    if (draft.length === 0 || busy) return;
    const accepted = await onSubmit(draft);
    if (accepted) draft = '';
  }

  function onInput(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    draft = target.value.replace(/[^a-zA-Z]/g, '').slice(0, WORD_LENGTH).toLowerCase();
    target.value = draft;
    if (error !== null) onDismissError();
  }
</script>

<div class="picker">
  {#if current !== null}
    <div class="locked">
      <span class="eyebrow">Word for this round</span>
      <div class="word-row">
        <strong class="word" class:hidden={!revealed}>
          {revealed ? current.toUpperCase() : '•••••'}
        </strong>
        <button class="ghost" onclick={() => (revealed = !revealed)}>
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>
      <p class="muted note">Players cannot see this word until the round ends.</p>
    </div>
  {/if}

  <form
    onsubmit={(e) => {
      e.preventDefault();
      void commit();
    }}
  >
    <label class="eyebrow" for="secret-word">
      {current === null ? 'Choose the secret word' : 'Change the word'}
    </label>
    {#key shakeToken}
      <div class="field" class:shake={shakeToken > 0} class:invalid={error !== null}>
        <input
          id="secret-word"
          value={draft}
          oninput={onInput}
          placeholder="5 letters"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          maxlength={WORD_LENGTH}
          aria-invalid={error !== null}
          aria-describedby={error !== null ? 'secret-error' : undefined}
        />
        <!-- Deliberately NOT disabled for invalid words: the facilitator has to
             be able to submit one and be told "This is not an allowed word",
             the same as a player. Only an empty box blocks submission. -->
        <button type="submit" class="primary" disabled={draft.length === 0 || busy}>
          Set word
        </button>
        <button type="button" class="ghost" onclick={onRandom} disabled={busy}>Random</button>
      </div>
    {/key}
  </form>

  {#if error !== null}
    <p id="secret-error" class="error" role="alert">{error}</p>
  {:else if suggestions.length > 0}
    <div class="suggestions">
      {#each suggestions as word (word)}
        <button class="chip" onclick={() => void onSubmit(word)}>{word}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .picker {
    display: grid;
    gap: var(--space-3);
  }

  .locked {
    display: grid;
    gap: var(--space-1);
  }

  .word-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .word {
    font-family: var(--font-mono);
    font-size: 1.7rem;
    letter-spacing: 0.22em;
    color: var(--accent);
  }

  .word.hidden {
    color: var(--text-3);
    letter-spacing: 0.15em;
  }

  .note {
    margin: 0;
    font-size: 0.8rem;
  }

  form {
    display: grid;
    gap: var(--space-2);
  }

  .field {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  input {
    flex: 1 1 8rem;
    min-width: 0;
    padding: var(--space-3);
    background: var(--surface-2);
    border: 2px solid var(--border-2);
    border-radius: var(--radius-2);
    font-family: var(--font-mono);
    font-size: 1.1rem;
    letter-spacing: 0.28em;
    text-transform: uppercase;
  }

  .field.invalid input {
    border-color: var(--danger);
  }

  button.primary,
  button.ghost {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-2);
    font-weight: 700;
    border: 1px solid var(--border-2);
    background: var(--surface-2);
    color: var(--text-1);
    white-space: nowrap;
  }

  button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .error {
    margin: 0;
    color: var(--danger);
    font-weight: 600;
    font-size: 0.9rem;
  }

  .suggestions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .chip {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-pill);
    border: 1px solid var(--border-2);
    background: var(--surface-2);
    color: var(--text-2);
    font-family: var(--font-mono);
    font-size: 0.85rem;
  }

  .chip:hover {
    color: var(--text-1);
    border-color: var(--accent);
  }

  .shake {
    animation: shake 420ms var(--ease);
  }

  @keyframes shake {
    10%, 90% { transform: translateX(-3px); }
    20%, 80% { transform: translateX(5px); }
    30%, 50%, 70% { transform: translateX(-8px); }
    40%, 60% { transform: translateX(8px); }
  }

  @media (prefers-reduced-motion: reduce) {
    .shake { animation: none; }
  }
</style>
