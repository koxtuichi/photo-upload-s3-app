import { useEffect, useRef, useState } from "react";

/**
 * 要素の可視性を監視するカスタムフック
 * @param options - IntersectionObserverのオプション
 * @returns [ref, isVisible, observer] - 監視する要素に適用するref, 可視状態, IntersectionObserverインスタンス
 */
const useVisibilityObserver = (
  options: IntersectionObserverInit = {
    root: null,
    rootMargin: "0px",
    threshold: 0.1,
  }
) => {
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [wasVisible, setWasVisible] = useState<boolean>(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      const currentlyVisible = entry.isIntersecting;

      setIsVisible(currentlyVisible);

      if (currentlyVisible) {
        setWasVisible(true);
      }
    }, options);

    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [options.root, options.rootMargin, options.threshold]);

  useEffect(() => {
    const element = elementRef.current;
    const observer = observerRef.current;

    if (element && observer) {
      observer.observe(element);

      return () => {
        observer.unobserve(element);
      };
    }

    return undefined;
  }, [elementRef.current, observerRef.current]);

  const setRef = (element: HTMLElement | null) => {
    if (elementRef.current && observerRef.current) {
      observerRef.current.unobserve(elementRef.current);
    }

    elementRef.current = element;

    if (element && observerRef.current) {
      observerRef.current.observe(element);
    }
  };

  return {
    ref: setRef,
    isVisible,
    wasVisible,
    observer: observerRef.current,
  };
};

export default useVisibilityObserver;
