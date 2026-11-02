// 첨부 원본 — 미리보기(앱 안 창) + 다운로드. 둘 다 백엔드가 열람 권한을 확인하고 감사 로그에 남긴다.
// PNG·JPG 는 이미지로, PDF 는 브라우저 PDF 보기로 보여 주고, DOCX·DXF 처럼 브라우저가 못 여는 형식은 다운로드를 안내한다.
import { useEffect, useRef, useState } from 'react'
import { USE_MOCK, fileUrl } from '../../api/client'
import { cx, fileKind } from '../ui'
import { IconEye, IconX } from '../icons'

const btn = 'press inline-flex h-8 items-center gap-1.5 rounded-field px-3 text-[12.5px] font-bold'

export function FileActions({ assetId, filename, viewer }: { assetId: string; filename: string; viewer: string }) {
  const [open, setOpen] = useState(false)
  if (USE_MOCK)
    return (
      <span className="flex gap-1.5">
        <button type="button" className={cx(btn, 'bg-surface text-primary-ink ring-1 ring-primary-line ring-inset hover:bg-primary-soft')} onClick={() => alert(`[모의 모드] ${fileUrl(assetId, viewer)} 미리보기 — 열람 이력 기록`)}>
          <IconEye size={14} /> 미리보기
        </button>
        <button type="button" className={cx(btn, 'bg-primary text-on-primary hover:bg-primary-hover')} onClick={() => alert(`[모의 모드] ${fileUrl(assetId, viewer, true)} 다운로드 — 열람 이력 기록`)}>
          <DownloadIcon /> 다운로드
        </button>
      </span>
    )
  return (
    <span className="flex gap-1.5">
      <button type="button" onClick={() => setOpen(true)} className={cx(btn, 'bg-surface text-primary-ink ring-1 ring-primary-line ring-inset hover:bg-primary-soft')}>
        <IconEye size={14} /> 미리보기
      </button>
      <a href={fileUrl(assetId, viewer, true)} download={filename} className={cx(btn, 'bg-primary text-on-primary hover:bg-primary-hover')}>
        <DownloadIcon /> 다운로드<span className="sr-only"> ({filename})</span>
      </a>
      {open && <PreviewDialog assetId={assetId} filename={filename} viewer={viewer} onClose={() => setOpen(false)} />}
    </span>
  )
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  )
}

function PreviewDialog({ assetId, filename, viewer, onClose }: { assetId: string; filename: string; viewer: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const kind = fileKind(filename)
  const src = fileUrl(assetId, viewer)
  useEffect(() => {
    const d = ref.current
    d?.showModal()
    const onCancel = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    d?.addEventListener('cancel', onCancel)
    return () => d?.removeEventListener('cancel', onCancel)
  }, [onClose])
  return (
    <dialog
      ref={ref}
      aria-label={`${filename} 미리보기`}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto h-[88vh] w-[min(64rem,94vw)] overflow-hidden rounded-card border border-line bg-surface p-0 text-fg shadow-pop backdrop:bg-[#0c2340]/55"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-primary-soft/70 px-5 py-3">
          <p className="min-w-0 flex-1 truncate text-[14px] font-extrabold">{filename}</p>
          <a href={fileUrl(assetId, viewer, true)} download={filename} className={cx(btn, 'bg-primary text-on-primary hover:bg-primary-hover')}>
            <DownloadIcon /> 다운로드
          </a>
          <button type="button" onClick={onClose} aria-label="닫기" className="grid size-8 place-items-center rounded-full text-fg-2 hover:bg-surface-3">
            <IconX size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 bg-surface-2">
          {kind === 'image' ? (
            <div className="thin-scroll grid h-full place-items-center overflow-auto p-4">
              <img src={src} alt={`${filename} 원본`} className="max-h-full max-w-full rounded-field bg-white shadow-card" />
            </div>
          ) : kind === 'pdf' ? (
            <iframe src={src} title={`${filename} 미리보기`} className="h-full w-full border-0 bg-white" />
          ) : (
            <div className="grid h-full place-items-center p-6 text-center">
              <p className="max-w-sm text-[13.5px] text-fg-2">
                이 형식({filename.split('.').pop()?.toUpperCase()})은 브라우저에서 미리 볼 수 없어요.
                <br />
                다운로드해서 확인해 주세요.
              </p>
            </div>
          )}
        </div>
      </div>
    </dialog>
  )
}
