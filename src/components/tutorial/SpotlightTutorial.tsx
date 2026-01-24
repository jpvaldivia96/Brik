import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TutorialStep {
    targetId: string;
    title: string;
    description: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

const tutorialSteps: TutorialStep[] = [
    {
        targetId: 'brik-logo',
        title: '🏠 Inicio',
        description: 'Toca aquí para volver al panel principal',
        position: 'bottom',
    },
    {
        targetId: 'site-selector',
        title: '🔄 Cambiar obra',
        description: 'Selecciona entre tus diferentes obras',
        position: 'bottom',
    },
    {
        targetId: 'card-alert',
        title: '⚠️ Alertas',
        description: 'Trabajadores cerca del límite de tiempo',
        position: 'bottom',
    },
    {
        targetId: 'card-inobra',
        title: '👥 En tiempo real',
        description: 'Total de personas dentro ahora mismo',
        position: 'bottom',
    },
    {
        targetId: 'search-bar',
        title: '🔍 Buscar',
        description: 'Encuentra trabajadores o visitantes en obra',
        position: 'bottom',
    },
    {
        targetId: 'date-picker',
        title: '📅 Historial',
        description: 'Consulta registros de días anteriores',
        position: 'left',
    },
    {
        targetId: 'tab-contractors',
        title: '🏗️ Por contratista',
        description: 'Filtra personas según su contratista',
        position: 'bottom',
    },
    {
        targetId: 'tab-statistics',
        title: '📊 Datos clave',
        description: 'Información importante sobre tus ingresos',
        position: 'bottom',
    },
    {
        targetId: 'menu-button',
        title: '🧰 Más opciones',
        description: 'Herramientas, configuración y reportes',
        position: 'top',
    },
];

interface SpotlightTutorialProps {
    onComplete: () => void;
}

export function SpotlightTutorial({ onComplete }: SpotlightTutorialProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const overlayRef = useRef<HTMLDivElement>(null);

    const step = tutorialSteps[currentStep];
    const isLastStep = currentStep === tutorialSteps.length - 1;
    const isFirstStep = currentStep === 0;

    useEffect(() => {
        const updateTargetRect = () => {
            const element = document.getElementById(step.targetId);
            if (element) {
                const rect = element.getBoundingClientRect();
                setTargetRect(rect);

                // Scroll element into view if needed
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                // If element not found, skip to next step after a delay
                console.warn(`Tutorial target not found: ${step.targetId}`);
                setTargetRect(null);
            }
        };

        updateTargetRect();
        window.addEventListener('resize', updateTargetRect);
        window.addEventListener('scroll', updateTargetRect);

        return () => {
            window.removeEventListener('resize', updateTargetRect);
            window.removeEventListener('scroll', updateTargetRect);
        };
    }, [currentStep, step.targetId]);

    const handleNext = () => {
        if (isLastStep) {
            onComplete();
        } else {
            setCurrentStep((s) => s + 1);
        }
    };

    const handlePrev = () => {
        if (!isFirstStep) {
            setCurrentStep((s) => s - 1);
        }
    };

    const handleSkip = () => {
        onComplete();
    };

    // Calculate tooltip position
    const getTooltipStyle = (): React.CSSProperties => {
        if (!targetRect) return { display: 'none' };

        const padding = 16;
        const tooltipWidth = 280;
        const tooltipHeight = 150;

        let top = 0;
        let left = 0;

        switch (step.position) {
            case 'top':
                top = targetRect.top - tooltipHeight - padding;
                left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
                break;
            case 'bottom':
                top = targetRect.bottom + padding;
                left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
                break;
            case 'left':
                top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
                left = targetRect.left - tooltipWidth - padding;
                break;
            case 'right':
                top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
                left = targetRect.right + padding;
                break;
            default:
                top = targetRect.bottom + padding;
                left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        }

        // Keep tooltip within viewport
        left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
        top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16));

        return {
            position: 'fixed',
            top,
            left,
            width: tooltipWidth,
            zIndex: 10001,
        };
    };

    // Calculate spotlight mask using box-shadow
    const getSpotlightStyle = (): React.CSSProperties => {
        if (!targetRect) return {};

        const padding = 8;
        return {
            position: 'fixed',
            top: targetRect.top - padding,
            left: targetRect.left - padding,
            width: targetRect.width + padding * 2,
            height: targetRect.height + padding * 2,
            borderRadius: '12px',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.75)',
            zIndex: 10000,
            pointerEvents: 'none',
        };
    };

    return createPortal(
        <div ref={overlayRef} className="fixed inset-0 z-[9999]">
            {/* Spotlight hole */}
            {targetRect && <div style={getSpotlightStyle()} />}

            {/* Tooltip */}
            <div
                style={getTooltipStyle()}
                className={cn(
                    "bg-white rounded-2xl shadow-2xl p-5 animate-fade-in",
                    "border border-gray-100"
                )}
            >
                {/* Close button */}
                <button
                    onClick={handleSkip}
                    className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Content */}
                <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{step.title}</h3>
                    <p className="text-sm text-gray-600">{step.description}</p>
                </div>

                {/* Progress indicator */}
                <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                        {tutorialSteps.map((_, idx) => (
                            <div
                                key={idx}
                                className={cn(
                                    "w-2 h-2 rounded-full transition-colors",
                                    idx === currentStep ? "bg-purple-500" : "bg-gray-200"
                                )}
                            />
                        ))}
                    </div>

                    {/* Navigation buttons */}
                    <div className="flex gap-2">
                        {!isFirstStep && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handlePrev}
                                className="text-gray-600"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                        )}
                        <Button
                            size="sm"
                            onClick={handleNext}
                            className="bg-purple-500 hover:bg-purple-600 text-white"
                        >
                            {isLastStep ? '¡Listo!' : 'Siguiente'}
                            {!isLastStep && <ChevronRight className="w-4 h-4 ml-1" />}
                        </Button>
                    </div>
                </div>

                {/* Step counter */}
                <p className="text-xs text-gray-400 mt-3 text-center">
                    {currentStep + 1} de {tutorialSteps.length}
                </p>
            </div>
        </div>,
        document.body
    );
}
