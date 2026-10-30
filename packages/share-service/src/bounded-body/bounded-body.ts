import { HTTP_HEADERS } from '../constants/http';

type BodyRead = {
  readonly pieces: readonly Uint8Array[];
  readonly byteCount: number;
};

const UNDECLARED_LENGTH = '0';
const NOTHING_READ: BodyRead = { pieces: [], byteCount: 0 };
const START_OF_BODY = 0;

const readWithin = async (reader: ReadableStreamDefaultReader<Uint8Array>, maximumBytes: number, read: BodyRead): Promise<BodyRead | null> => {
  const next = await reader.read();

  if (next.done) {
    return read;
  }

  const byteCount = read.byteCount + next.value.byteLength;

  if (byteCount > maximumBytes) {
    await reader.cancel();

    return null;
  }

  return await readWithin(reader, maximumBytes, { pieces: [...read.pieces, next.value], byteCount });
};

const joinedPiecesOf = (read: BodyRead): ArrayBuffer => {
  const joined = new Uint8Array(read.byteCount);

  read.pieces.reduce((offset, piece) => {
    joined.set(piece, offset);

    return offset + piece.byteLength;
  }, START_OF_BODY);

  return joined.buffer;
};

export const boundedBodyOf = async (request: Request, maximumBytes: number): Promise<ArrayBuffer | null> => {
  if (Number(request.headers.get(HTTP_HEADERS.CONTENT_LENGTH) ?? UNDECLARED_LENGTH) > maximumBytes) {
    return null;
  }

  if (request.body === null) {
    return new ArrayBuffer(START_OF_BODY);
  }

  const read = await readWithin(request.body.getReader(), maximumBytes, NOTHING_READ);

  return read === null ? null : joinedPiecesOf(read);
};
