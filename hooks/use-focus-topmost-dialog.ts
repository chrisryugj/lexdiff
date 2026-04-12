/**
 * H-UX1: 중첩 모달 포커스 관리 custom hook.
 *
 * 중복되어 있던 두 가지 요구사항을 하나로 통합:
 *  1) 모달이 열릴 때 topmost Radix Dialog 내부 첫 포커스 가능 요소로 이동
 *  2) 모달이 닫힐 때 모달 open 직전에 포커스가 있던 요소로 복원
 *
 * Radix Dialog 자체도 onCloseAutoFocus/onOpenAutoFocus로 관리하지만, 커스텀
 * 타이밍/체이닝이 필요한 기존 모달 구현에서 명시적으로 보강한다.
 */
import { useEffect } from 'react'

export function useFocusTopmostDialog(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return

    const previouslyFocused = (typeof document !== 'undefined'
      ? (document.activeElement as HTMLElement | null)
      : null)

    const timer = setTimeout(() => {
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"]')
      const dialog = dialogs[dialogs.length - 1]
      if (!dialog) return
      const firstFocusable = dialog.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      firstFocusable?.focus()
    }, 150)

    return () => {
      clearTimeout(timer)
      // 닫힘 시 직전 포커스 복원 (Radix가 처리해도 이중 안전망).
      // 이미 다른 인터랙션으로 포커스 이동한 경우는 덮어쓰지 않음.
      if (previouslyFocused && document.activeElement === document.body) {
        try { previouslyFocused.focus() } catch { /* noop */ }
      }
    }
  }, [isOpen])
}
