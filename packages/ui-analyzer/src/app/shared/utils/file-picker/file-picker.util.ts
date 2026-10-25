const INPUT_ELEMENT = 'input';
const FILE_INPUT_TYPE = 'file';
const HIDDEN_DISPLAY = 'none';
const CHANGE_EVENT = 'change';
const CANCEL_EVENT = 'cancel';
const FOCUS_EVENT = 'focus';

export const CANCEL_GRACE_MILLISECONDS = 1000;

type FilePickRequest = {
  readonly accept: string;
  readonly allowsMany: boolean;
};

export const pickFiles = async (document: Document, request: FilePickRequest): Promise<readonly File[]> =>
  await new Promise<readonly File[]>((resolve) => {
    const picker = document.createElement(INPUT_ELEMENT);
    const listening = new AbortController();
    const pending: { timer?: ReturnType<typeof setTimeout> } = {};

    const answer = (files: readonly File[]): void => {
      clearTimeout(pending.timer);
      listening.abort();
      picker.remove();
      resolve(files);
    };

    const answerWithNothingUnlessPickedSoon = (): void => {
      clearTimeout(pending.timer);
      pending.timer = setTimeout(() => answer([]), CANCEL_GRACE_MILLISECONDS);
    };

    picker.type = FILE_INPUT_TYPE;
    picker.multiple = request.allowsMany;
    picker.accept = request.accept;
    picker.style.display = HIDDEN_DISPLAY;
    picker.addEventListener(CHANGE_EVENT, () => answer(Array.from(picker.files ?? [])), { signal: listening.signal });
    picker.addEventListener(CANCEL_EVENT, () => answer([]), { signal: listening.signal });
    document.defaultView?.addEventListener(FOCUS_EVENT, answerWithNothingUnlessPickedSoon, { signal: listening.signal });

    document.body.appendChild(picker);
    picker.click();
  });
