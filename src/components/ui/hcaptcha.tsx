import { forwardRef, useRef, useImperativeHandle } from 'react';
import HCaptchaLib from '@hcaptcha/react-hcaptcha';

export interface HCaptchaRef {
    execute: () => Promise<string | null>;
    reset: () => void;
}

interface HCaptchaProps {
    onVerify?: (token: string) => void;
    onError?: (error: string) => void;
    onExpire?: () => void;
}

export const HCaptcha = forwardRef<HCaptchaRef, HCaptchaProps>(
    ({ onVerify, onError, onExpire }, ref) => {
        const captchaRef = useRef<HCaptchaLib>(null);
        const resolveRef = useRef<((token: string | null) => void) | null>(null);

        const siteKey = import.meta.env.VITE_HCAPTCHA_SITE_KEY;

        useImperativeHandle(ref, () => ({
            execute: () => {
                return new Promise<string | null>((resolve) => {
                    resolveRef.current = resolve;
                    captchaRef.current?.execute();
                });
            },
            reset: () => {
                captchaRef.current?.resetCaptcha();
                resolveRef.current = null;
            },
        }));

        const handleVerify = (token: string) => {
            onVerify?.(token);
            resolveRef.current?.(token);
            resolveRef.current = null;
        };

        const handleError = (error: string) => {
            onError?.(error);
            resolveRef.current?.(null);
            resolveRef.current = null;
        };

        const handleExpire = () => {
            onExpire?.();
            resolveRef.current?.(null);
            resolveRef.current = null;
        };

        if (!siteKey) {
            console.warn('VITE_HCAPTCHA_SITE_KEY not configured');
            return null;
        }

        return (
            <HCaptchaLib
                ref={captchaRef}
                sitekey={siteKey}
                size="invisible"
                onVerify={handleVerify}
                onError={handleError}
                onExpire={handleExpire}
            />
        );
    }
);

HCaptcha.displayName = 'HCaptcha';
