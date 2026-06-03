import { useEffect, useRef, useState } from 'react';
import { X, Upload, Check, Loader2, ImagePlus, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Contributor {
  id: string;
  name: string;
  role: string;
  avatar_url: string;
}

interface AvatarUploaderProps {
  onClose: () => void;
  onUpdated: () => void;
}

const BUCKET = 'contributor-avatars';

export default function AvatarUploader({ onClose, onUpdated }: AvatarUploaderProps) {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from('contributors')
        .select('id,name,role,avatar_url')
        .order('sort_order', { ascending: true });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      setContributors((data ?? []) as Contributor[]);
      const nikhil = (data ?? []).find((c) => c.name === 'Nikhil Mattapalli');
      if (nikhil) setSelectedId(nikhil.id);
      else if (data && data.length > 0) setSelectedId(data[0].id);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pickFile(f: File | null | undefined) {
    setError('');
    setSuccess(false);
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB.');
      return;
    }
    setFile(f);
  }

  async function handleUpload() {
    if (!file || !selectedId) return;
    const contributor = contributors.find((c) => c.id === selectedId);
    if (!contributor) return;

    setUploading(true);
    setError('');
    setSuccess(false);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const safeName = contributor.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const path = `${safeName}-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        });

      if (uploadErr) throw uploadErr;

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      const { error: updateErr } = await supabase
        .from('contributors')
        .update({ avatar_url: publicUrl })
        .eq('id', selectedId);

      if (updateErr) throw updateErr;

      setSuccess(true);
      setFile(null);
      setContributors((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, avatar_url: publicUrl } : c)),
      );
      onUpdated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed.';
      setError(msg);
    } finally {
      setUploading(false);
    }
  }

  const selected = contributors.find((c) => c.id === selectedId);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-2xl rounded-3xl border border-stone-50/10 bg-[#0d0d10] shadow-[0_30px_80px_rgba(0,0,0,0.6)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-stone-50/[0.06]">
          <div>
            <div className="text-[11px] tracking-[0.3em] uppercase text-stone-500">
              Manage avatars
            </div>
            <h3 className="mt-1 text-[18px] font-semibold tracking-tight text-stone-50">
              Upload a contributor photo
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full grid place-items-center text-stone-400 hover:text-stone-50 hover:bg-stone-50/[0.06] transition-colors"
            aria-label="Close uploader"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="text-[11px] tracking-[0.18em] uppercase text-stone-500">
              Contributor
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="mt-2 w-full rounded-xl bg-stone-50/[0.04] border border-stone-50/10 px-4 py-3 text-[14px] text-stone-100 outline-none focus:border-amber-300/40"
            >
              {contributors.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#0d0d10]">
                  {c.name} — {c.role}
                </option>
              ))}
            </select>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-colors px-6 py-8 flex flex-col items-center justify-center text-center ${
              dragActive
                ? 'border-amber-300/60 bg-amber-300/5'
                : 'border-stone-50/15 bg-stone-50/[0.02] hover:border-amber-300/40'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            {previewUrl ? (
              <div className="flex items-center gap-4">
                <img
                  src={previewUrl}
                  alt="preview"
                  className="w-20 h-20 rounded-2xl object-cover border border-stone-50/15"
                />
                <div className="text-left">
                  <div className="text-[14px] font-medium text-stone-100 truncate max-w-[280px]">
                    {file?.name}
                  </div>
                  <div className="text-[12px] text-stone-500">
                    {file ? (file.size / 1024).toFixed(1) : 0} KB · click to replace
                  </div>
                </div>
              </div>
            ) : selected?.avatar_url ? (
              <div className="flex items-center gap-4">
                <img
                  src={selected.avatar_url}
                  alt={selected.name}
                  className="w-20 h-20 rounded-2xl object-cover border border-stone-50/15"
                />
                <div className="text-left">
                  <div className="text-[14px] font-medium text-stone-100">Current photo</div>
                  <div className="text-[12px] text-stone-500">
                    Click or drop a file to replace
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-stone-50/[0.06] grid place-items-center mb-3">
                  <ImagePlus className="w-5 h-5 text-amber-300" />
                </div>
                <div className="text-[14px] font-medium text-stone-100">
                  Drag a photo here or click to choose
                </div>
                <div className="text-[12px] text-stone-500 mt-1">PNG, JPG, WEBP up to 10MB</div>
              </>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-[12.5px] text-rose-200">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && !error && (
            <div className="flex items-start gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-[12.5px] text-emerald-200">
              <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Saved. The new photo is live on the page.</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-full text-[13px] text-stone-300 hover:text-stone-50 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || uploading || !selectedId}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-medium bg-amber-400 hover:bg-amber-300 disabled:bg-stone-50/[0.08] disabled:text-stone-500 disabled:cursor-not-allowed text-stone-900 transition-colors shadow-[0_8px_24px_rgba(251,191,36,0.3)] disabled:shadow-none"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Uploading
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Save photo
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
