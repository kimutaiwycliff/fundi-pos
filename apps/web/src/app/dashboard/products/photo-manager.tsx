'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, ImageIcon, ImagePlus, Loader2, Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { clientFetch, errorMessageFrom } from '@/lib/client-fetch';

// One photo in a product's (or a variant's) ordered photo list. Index 0 is
// the cover - saved as the record's `image` - and everything after it is
// saved, in order, as its `gallery` (see product-dialog.tsx handleSubmit).
// `url` is a preview url only (the media doc's 240w thumb when it has one).
export type Photo = { id: number; url: string | null };

// 1 cover + Products.ts's gallery maxRows (8), for both products and variants.
export const MAX_PHOTOS = 9;

type MediaUploadDoc = { id: number; url?: string | null; sizes?: { thumb?: { url?: string | null } | null } | null };

export function previewUrlOf(doc: MediaUploadDoc): string | null {
  return doc.sizes?.thumb?.url || doc.url || null;
}

// Cover + gallery ids (as stored on the record) -> the ordered list this
// component edits. Ids that don't resolve to a url still show (as a
// placeholder tile) so a save never silently drops them.
export function photosFrom(
  image: number | null | undefined,
  gallery: number[] | null | undefined,
  urlById: Record<number, string>,
): Photo[] {
  const ids = [image, ...(gallery ?? [])].filter((id): id is number => typeof id === 'number');
  return [...new Set(ids)].map((id) => ({ id, url: urlById[id] ?? null }));
}

// The inverse of photosFrom - what gets sent to the API.
export function photosToFields(photos: Photo[]): { image: number | null; gallery: number[] } {
  return { image: photos[0]?.id ?? null, gallery: photos.slice(1).map((p) => p.id) };
}

type Pending = { key: string; previewUrl: string; photo?: Photo; settled: boolean };

async function uploadPhoto(file: File): Promise<Photo> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await clientFetch('/api/media', { method: 'POST', body: formData });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.doc) {
    throw new Error(errorMessageFrom(body, `Couldn't upload ${file.name}`));
  }
  return { id: body.doc.id, url: previewUrlOf(body.doc) };
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const tileButton =
  'inline-flex size-7 items-center justify-center rounded-md bg-background/90 text-foreground shadow-sm ring-1 ring-border backdrop-blur-sm transition-colors hover:bg-background disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

// Ordered photo grid: first tile is the cover. Every action is a real
// button (keyboard + touch); native drag-and-drop is a desktop extra on top.
// Uploads run in parallel, each with its own spinner tile, and land in the
// list in the order the files were picked, not the order they finish.
export function PhotoManager({
  label,
  description,
  photos,
  onChange,
  onUploadingChange,
}: {
  label: string;
  description?: string;
  photos: Photo[];
  // Updater form - uploads finish asynchronously, possibly after the
  // shopkeeper has already reordered other photos.
  onChange: (update: (prev: Photo[]) => Photo[]) => void;
  // +n when uploads start, -1 as each one settles - lets the dialog hold
  // Save until every photo has an id.
  onUploadingChange?: (delta: number) => void;
}) {
  const inputId = useId();
  const descriptionId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // Source of truth for in-flight uploads (handlers settle out of order);
  // `pending` is only its rendered copy.
  const pendingRef = useRef<Pending[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  // Where focus should land once a reorder/remove has re-rendered (a moved
  // DOM node can lose focus).
  const focusAfter = useRef<{ key: number | null; action: string } | null>(null);

  const total = photos.length + pending.length;
  const remaining = MAX_PHOTOS - total;

  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    if (target.key == null) {
      addButtonRef.current?.focus();
      return;
    }
    const tile = gridRef.current?.querySelector<HTMLElement>(`[data-photo-key="${target.key}"]`);
    const preferred = tile?.querySelector<HTMLButtonElement>(`[data-action="${target.action}"]:not(:disabled)`);
    const fallback = tile?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    (preferred ?? fallback)?.focus();
  }, [photos]);

  // Revoke any object urls still alive if the dialog unmounts mid-upload.
  useEffect(() => {
    const ref = pendingRef;
    return () => {
      for (const p of ref.current) URL.revokeObjectURL(p.previewUrl);
    };
  }, []);

  function settle(key: string, photo: Photo | null) {
    const list = pendingRef.current;
    const entry = list.find((p) => p.key === key);
    if (entry) {
      entry.settled = true;
      entry.photo = photo ?? undefined;
    }
    // Flush the settled prefix so photos keep the order they were picked in.
    const flushed: Photo[] = [];
    while (list.length > 0 && list[0].settled) {
      const done = list.shift()!;
      URL.revokeObjectURL(done.previewUrl);
      if (done.photo) flushed.push(done.photo);
    }
    setPending(list.slice());
    if (flushed.length > 0) {
      onChange((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...flushed.filter((p) => !seen.has(p.id))].slice(0, MAX_PHOTOS);
      });
      setAnnouncement(`${flushed.length} photo${flushed.length === 1 ? '' : 's'} added`);
    }
    onUploadingChange?.(-1);
  }

  function addFiles(fileList: FileList | File[]) {
    const images = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    const skippedType = Array.from(fileList).length - images.length;
    if (skippedType > 0) toast.error(`${skippedType} file${skippedType === 1 ? " isn't an image" : "s aren't images"} - skipped`);
    if (images.length === 0) return;
    const room = MAX_PHOTOS - photos.length - pendingRef.current.length;
    if (room <= 0) {
      toast.error(`You can have up to ${MAX_PHOTOS} photos (1 cover + 8 more). Remove one to add another.`);
      return;
    }
    const accepted = images.slice(0, room);
    if (images.length > room) {
      toast.error(
        `Only ${MAX_PHOTOS} photos allowed - added the first ${room}, ${images.length - room} left out.`,
      );
    }
    const entries: Pending[] = accepted.map((file) => ({
      key: crypto.randomUUID(),
      previewUrl: URL.createObjectURL(file),
      settled: false,
    }));
    pendingRef.current = [...pendingRef.current, ...entries];
    setPending(pendingRef.current.slice());
    onUploadingChange?.(entries.length);
    setAnnouncement(`Uploading ${entries.length} photo${entries.length === 1 ? '' : 's'}`);
    accepted.forEach((file, i) => {
      uploadPhoto(file)
        .then((photo) => settle(entries[i].key, photo))
        .catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : `Couldn't upload ${file.name}`);
          settle(entries[i].key, null);
        });
    });
  }

  function reorder(from: number, to: number, action: string, message: string) {
    if (from === to || to < 0 || to >= photos.length) return;
    focusAfter.current = { key: photos[from].id, action };
    onChange((prev) => (prev[from]?.id === photos[from].id ? move(prev, from, to) : prev));
    setAnnouncement(message);
  }

  function setCover(index: number) {
    const id = photos[index].id;
    focusAfter.current = { key: id, action: 'right' };
    // Swap: the old cover takes the new cover's old place.
    onChange((prev) => {
      const i = prev.findIndex((p) => p.id === id);
      if (i <= 0) return prev;
      const next = prev.slice();
      [next[0], next[i]] = [next[i], next[0]];
      return next;
    });
    setAnnouncement(`Photo ${index + 1} is now the cover`);
  }

  function remove(index: number) {
    const id = photos[index].id;
    const neighbour = photos[index + 1] ?? photos[index - 1];
    focusAfter.current = { key: neighbour?.id ?? null, action: 'remove' };
    onChange((prev) => prev.filter((p) => p.id !== id));
    setAnnouncement(`Photo ${index + 1} removed`);
  }

  function endDrag() {
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium" id={`${inputId}-label`}>
          {label}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {total}/{MAX_PHOTOS}
        </span>
      </div>
      <div
        ref={gridRef}
        role="list"
        aria-labelledby={`${inputId}-label`}
        aria-describedby={descriptionId}
        className={cn(
          'grid grid-cols-3 gap-2 rounded-lg sm:grid-cols-4',
          fileDragOver && 'outline-2 outline-offset-4 outline-primary outline-dashed',
        )}
        onDragOver={(e) => {
          if (dragIndex === null && e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setFileDragOver(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileDragOver(false);
        }}
        onDrop={(e) => {
          setFileDragOver(false);
          if (dragIndex === null && e.dataTransfer.files.length > 0) {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }
        }}
      >
        {photos.map((photo, index) => {
          const n = index + 1;
          const isCover = index === 0;
          return (
            <div
              key={photo.id}
              role="listitem"
              data-photo-key={photo.id}
              draggable
              onDragStart={(e) => {
                setDragIndex(index);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(photo.id));
              }}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (overIndex !== index) setOverIndex(index);
              }}
              onDrop={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                e.stopPropagation();
                reorder(dragIndex, index, 'left', `Photo ${dragIndex + 1} moved to position ${n}`);
                endDrag();
              }}
              onDragEnd={endDrag}
              className={cn(
                'group relative aspect-square overflow-hidden rounded-md border bg-muted',
                isCover && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                dragIndex === index && 'opacity-40',
                overIndex === index && dragIndex !== null && dragIndex !== index && 'outline-2 outline-primary',
              )}
            >
              {photo.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.url}
                  alt={isCover ? `Photo ${n} (cover)` : `Photo ${n}`}
                  draggable={false}
                  loading="lazy"
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground" aria-label={`Photo ${n}`}>
                  <ImageIcon className="size-5" />
                </div>
              )}
              {isCover ? (
                <span className="absolute top-1 left-1 rounded-sm bg-primary px-1.5 py-0.5 text-[10px] leading-none font-semibold text-primary-foreground shadow-sm">
                  Cover
                </span>
              ) : null}
              <button
                type="button"
                data-action="remove"
                className={cn(tileButton, 'absolute top-1 right-1 hover:text-destructive')}
                aria-label={`Remove photo ${n}`}
                onClick={() => remove(index)}
              >
                <X className="size-3.5" />
              </button>
              <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1">
                <button
                  type="button"
                  data-action="left"
                  className={tileButton}
                  aria-label={`Move photo ${n} left`}
                  disabled={index === 0}
                  onClick={() => reorder(index, index - 1, 'left', `Photo ${n} moved to position ${n - 1}`)}
                >
                  <ChevronLeft className="size-4" />
                </button>
                {!isCover ? (
                  <button
                    type="button"
                    data-action="cover"
                    className={tileButton}
                    aria-label={`Set photo ${n} as cover`}
                    title="Set as cover"
                    onClick={() => setCover(index)}
                  >
                    <Star className="size-3.5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  data-action="right"
                  className={tileButton}
                  aria-label={`Move photo ${n} right`}
                  disabled={index === photos.length - 1}
                  onClick={() => reorder(index, index + 1, 'right', `Photo ${n} moved to position ${n + 1}`)}
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          );
        })}

        {pending.map((p) => (
          <div
            key={p.key}
            role="listitem"
            aria-label="Uploading photo"
            aria-busy={!p.settled}
            className="relative aspect-square overflow-hidden rounded-md border bg-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.previewUrl} alt="" className={cn('size-full object-cover', !p.settled && 'opacity-50')} />
            {!p.settled ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-[11px] font-medium shadow-sm">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Uploading
                </span>
              </div>
            ) : null}
          </div>
        ))}

        {remaining > 0 ? (
          <div role="listitem" className="aspect-square">
            <button
              ref={addButtonRef}
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex size-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-muted-foreground/40 p-1 text-center text-muted-foreground transition-colors hover:border-primary hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ImagePlus className="size-5" aria-hidden />
              <span className="text-xs font-medium">{total === 0 ? 'Add photos' : 'Add more'}</span>
              <span className="text-[10px] leading-tight">{remaining} left</span>
            </button>
          </div>
        ) : null}
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <p id={descriptionId} className="text-xs text-muted-foreground">
        {remaining <= 0
          ? `That's the maximum of ${MAX_PHOTOS} photos - remove one to add another.`
          : (description ??
            'The first photo is the cover. Use the arrows (or drag) to reorder; the star makes a photo the cover.')}
      </p>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
