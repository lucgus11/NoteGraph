// ---------------------------------------------------------------------------
// Panneau éditeur : textarea Markdown avec auto-complétion des liens
// internes [[Nom]] et notification de changement pour la sauvegarde auto.
// ---------------------------------------------------------------------------
export interface EditorCallbacks {
  onChange: (content: string) => void;
}

export class NoteEditor {
  private textarea: HTMLTextAreaElement;
  private autocompleteEl: HTMLUListElement;
  private allNoteNames: string[] = [];
  private callbacks: EditorCallbacks;
  private linkStart = -1;

  constructor(
    textarea: HTMLTextAreaElement,
    autocompleteEl: HTMLUListElement,
    callbacks: EditorCallbacks
  ) {
    this.textarea = textarea;
    this.autocompleteEl = autocompleteEl;
    this.callbacks = callbacks;
    this.bind();
  }

  setAvailableNoteNames(names: string[]): void {
    this.allNoteNames = names;
  }

  setContent(content: string): void {
    this.textarea.value = content;
  }

  getContent(): string {
    return this.textarea.value;
  }

  setEnabled(enabled: boolean): void {
    this.textarea.disabled = !enabled;
  }

  focus(): void {
    this.textarea.focus();
  }

  private bind(): void {
    this.textarea.addEventListener("input", () => {
      this.callbacks.onChange(this.textarea.value);
      this.handleAutocompleteTrigger();
    });

    this.textarea.addEventListener("keydown", (e) => {
      if (!this.autocompleteVisible()) return;
      const items = [...this.autocompleteEl.querySelectorAll("li")];
      const activeIdx = items.findIndex((li) => li.classList.contains("active"));

      if (e.key === "Escape") {
        this.hideAutocomplete();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        this.setActiveItem(items, Math.min(items.length - 1, activeIdx + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.setActiveItem(items, Math.max(0, activeIdx - 1));
      } else if (e.key === "Enter" && activeIdx >= 0) {
        e.preventDefault();
        this.applyAutocomplete(items[activeIdx].textContent ?? "");
      }
    });

    this.textarea.addEventListener("blur", () => {
      // Léger délai pour permettre le clic sur un item avant fermeture.
      setTimeout(() => this.hideAutocomplete(), 150);
    });
  }

  private handleAutocompleteTrigger(): void {
    const pos = this.textarea.selectionStart;
    const text = this.textarea.value.slice(0, pos);
    const match = text.match(/\[\[([^\]\n]*)$/);

    if (!match) {
      this.hideAutocomplete();
      return;
    }

    this.linkStart = pos - match[1].length;
    const query = match[1].toLowerCase();
    const suggestions = this.allNoteNames
      .filter((n) => n.toLowerCase().includes(query))
      .slice(0, 8);

    if (suggestions.length === 0) {
      this.hideAutocomplete();
      return;
    }

    this.renderAutocomplete(suggestions);
  }

  private renderAutocomplete(suggestions: string[]): void {
    this.autocompleteEl.innerHTML = "";
    suggestions.forEach((name, i) => {
      const li = document.createElement("li");
      li.textContent = name;
      if (i === 0) li.classList.add("active");
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.applyAutocomplete(name);
      });
      this.autocompleteEl.appendChild(li);
    });
    this.autocompleteEl.classList.remove("hidden");
  }

  private setActiveItem(items: HTMLLIElement[], idx: number): void {
    items.forEach((li, i) => li.classList.toggle("active", i === idx));
  }

  private applyAutocomplete(name: string): void {
    const pos = this.textarea.selectionStart;
    const value = this.textarea.value;
    const before = value.slice(0, this.linkStart);
    const after = value.slice(pos);
    const closing = after.startsWith("]]") ? "" : "]]";
    const newValue = `${before}${name}${closing}${after}`;
    this.textarea.value = newValue;
    const newPos = before.length + name.length + closing.length;
    this.textarea.setSelectionRange(newPos, newPos);
    this.hideAutocomplete();
    this.callbacks.onChange(this.textarea.value);
    this.textarea.focus();
  }

  private autocompleteVisible(): boolean {
    return !this.autocompleteEl.classList.contains("hidden");
  }

  private hideAutocomplete(): void {
    this.autocompleteEl.classList.add("hidden");
    this.autocompleteEl.innerHTML = "";
  }
}
