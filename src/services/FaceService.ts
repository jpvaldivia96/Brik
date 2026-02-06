import * as faceapi from 'face-api.js';
import { Capacitor } from '@capacitor/core';

// STANDARD MODE: TinyFaceDetector (current behavior for flag=false)
// Fast but less accurate in low-light
const STANDARD_DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.3
});
const STANDARD_MATCH_THRESHOLD = 0.6;

// ENHANCED MODE: SsdMobilenetv1 (for flag=true)
// More accurate, especially in low-light conditions
// Slightly slower (~200-300ms) but more reliable
const ENHANCED_MIN_CONFIDENCE = 0.5;
const ENHANCED_MATCH_THRESHOLD = 0.5; // Stricter matching to reduce false positives

export class FaceService {
    private static instance: FaceService;
    private isStandardLoaded: boolean = false;
    private isEnhancedLoaded: boolean = false;
    private loadError: string | null = null;
    private labeledDescriptors: faceapi.LabeledFaceDescriptors[] = [];
    private workingModelUrl: string | null = null;
    private currentMode: 'standard' | 'enhanced' = 'standard';

    private constructor() { }

    public static getInstance(): FaceService {
        if (!FaceService.instance) {
            FaceService.instance = new FaceService();
        }
        return FaceService.instance;
    }

    public getLoadError(): string | null {
        return this.loadError;
    }

    public isModelsLoaded(): boolean {
        return this.isStandardLoaded;
    }

    public isEnhancedModelsLoaded(): boolean {
        return this.isEnhancedLoaded;
    }

    // Test if we can fetch a model file from a given path
    private async testModelPath(basePath: string): Promise<boolean> {
        const testFile = `${basePath}/tiny_face_detector_model-weights_manifest.json`;
        console.log('FaceService: Testing path:', testFile);

        try {
            const response = await fetch(testFile, { method: 'HEAD' });
            console.log('FaceService: Path test result:', response.ok, response.status);
            return response.ok;
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.log('FaceService: Path test failed:', errMsg);
            return false;
        }
    }

    // Find a working model path
    private async findWorkingModelPath(): Promise<string | null> {
        console.log('FaceService: Platform:', Capacitor.getPlatform());
        console.log('FaceService: isNative:', Capacitor.isNativePlatform());
        console.log('FaceService: Origin:', window.location.origin);
        console.log('FaceService: Href:', window.location.href);

        // Build list of paths to try
        const pathsToTry: string[] = [];

        if (Capacitor.isNativePlatform()) {
            const origin = window.location.origin;
            pathsToTry.push(`${origin}/models`);
            pathsToTry.push('/models');
            pathsToTry.push('./models');
        } else {
            pathsToTry.push('./models');
            pathsToTry.push('/models');
        }

        for (const path of pathsToTry) {
            console.log('FaceService: Trying path:', path);
            const works = await this.testModelPath(path);
            if (works) {
                console.log('FaceService: Found working path:', path);
                return path;
            }
        }

        return null;
    }

    // Load standard models (TinyFaceDetector - current behavior)
    public async loadModels(): Promise<void> {
        if (this.isStandardLoaded) {
            console.log('FaceService: Standard models already loaded');
            return;
        }

        console.log('=== FaceService: Starting STANDARD model load ===');
        this.loadError = null;

        try {
            this.workingModelUrl = await this.findWorkingModelPath();

            if (!this.workingModelUrl) {
                const error = 'No se pudo acceder a los modelos de IA en ninguna ruta';
                console.error('FaceService:', error);
                this.loadError = error;
                throw new Error(error);
            }

            console.log('FaceService: Loading models from:', this.workingModelUrl);

            console.log('FaceService: Loading tinyFaceDetector...');
            await faceapi.nets.tinyFaceDetector.loadFromUri(this.workingModelUrl);
            console.log('FaceService: ✓ tinyFaceDetector loaded');

            console.log('FaceService: Loading faceLandmark68Net...');
            await faceapi.nets.faceLandmark68Net.loadFromUri(this.workingModelUrl);
            console.log('FaceService: ✓ faceLandmark68Net loaded');

            console.log('FaceService: Loading faceRecognitionNet...');
            await faceapi.nets.faceRecognitionNet.loadFromUri(this.workingModelUrl);
            console.log('FaceService: ✓ faceRecognitionNet loaded');

            this.isStandardLoaded = true;
            this.currentMode = 'standard';
            this.loadError = null;
            console.log('=== FaceService: Standard models loaded successfully ===');

        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : 'Error desconocido al cargar modelos';
            console.error('FaceService: Load failed:', errorMsg);
            this.loadError = errorMsg;
            this.isStandardLoaded = false;
            throw error;
        }
    }

    // Load enhanced models (SsdMobilenetv1 - better accuracy in low-light)
    public async loadEnhancedModels(): Promise<void> {
        if (this.isEnhancedLoaded) {
            console.log('FaceService: Enhanced models already loaded');
            return;
        }

        console.log('=== FaceService: Starting ENHANCED model load (SsdMobilenetv1) ===');
        this.loadError = null;

        try {
            this.workingModelUrl = await this.findWorkingModelPath();

            if (!this.workingModelUrl) {
                const error = 'No se pudo acceder a los modelos de IA mejorados';
                console.error('FaceService:', error);
                this.loadError = error;
                throw new Error(error);
            }

            console.log('FaceService: Loading enhanced models from:', this.workingModelUrl);

            // Load SSD MobileNet (more accurate than TinyFaceDetector, especially in low-light)
            console.log('FaceService: Loading ssdMobilenetv1...');
            await faceapi.nets.ssdMobilenetv1.loadFromUri(this.workingModelUrl);
            console.log('FaceService: ✓ ssdMobilenetv1 loaded');

            console.log('FaceService: Loading faceLandmark68Net...');
            await faceapi.nets.faceLandmark68Net.loadFromUri(this.workingModelUrl);
            console.log('FaceService: ✓ faceLandmark68Net loaded');

            console.log('FaceService: Loading faceRecognitionNet...');
            await faceapi.nets.faceRecognitionNet.loadFromUri(this.workingModelUrl);
            console.log('FaceService: ✓ faceRecognitionNet loaded');

            this.isEnhancedLoaded = true;
            this.isStandardLoaded = true; // Mark standard as loaded too (shared models)
            this.currentMode = 'enhanced';
            this.loadError = null;
            console.log('=== FaceService: Enhanced models loaded successfully ===');

        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : 'Error desconocido al cargar modelos mejorados';
            console.error('FaceService: Enhanced load failed:', errorMsg);
            this.loadError = errorMsg;
            this.isEnhancedLoaded = false;
            throw error;
        }
    }

    // Get face descriptor using standard mode (TinyFaceDetector)
    public async getDescriptor(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<Float32Array | undefined> {
        if (!this.isStandardLoaded) {
            console.log('FaceService: Models not loaded, loading now...');
            await this.loadModels();
        }

        if (!this.isStandardLoaded) {
            throw new Error('Los modelos de IA no se pudieron cargar: ' + (this.loadError || 'Error desconocido'));
        }

        console.log('FaceService: Starting STANDARD face detection...');
        const startTime = Date.now();

        try {
            const detection = await faceapi
                .detectSingleFace(imageElement, STANDARD_DETECTOR_OPTIONS)
                .withFaceLandmarks()
                .withFaceDescriptor();

            const elapsed = Date.now() - startTime;

            if (detection) {
                console.log(`FaceService: Face detected in ${elapsed}ms, score: ${detection.detection.score}`);
            } else {
                console.log(`FaceService: No face detected after ${elapsed}ms`);
            }

            return detection?.descriptor;
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            console.error('FaceService: Detection error:', errMsg);
            throw e;
        }
    }

    // Get face descriptor using enhanced mode (SsdMobilenetv1 - better for low-light)
    public async getEnhancedDescriptor(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<Float32Array | undefined> {
        if (!this.isEnhancedLoaded) {
            console.log('FaceService: Enhanced models not loaded, loading now...');
            await this.loadEnhancedModels();
        }

        if (!this.isEnhancedLoaded) {
            throw new Error('Los modelos de IA mejorados no se pudieron cargar: ' + (this.loadError || 'Error desconocido'));
        }

        console.log('FaceService: Starting ENHANCED face detection (SsdMobilenetv1)...');
        const startTime = Date.now();

        try {
            // Use SSD MobileNet with higher confidence for better accuracy
            const enhancedOptions = new faceapi.SsdMobilenetv1Options({
                minConfidence: ENHANCED_MIN_CONFIDENCE
            });

            const detection = await faceapi
                .detectSingleFace(imageElement, enhancedOptions)
                .withFaceLandmarks()
                .withFaceDescriptor();

            const elapsed = Date.now() - startTime;

            if (detection) {
                console.log(`FaceService: ENHANCED face detected in ${elapsed}ms, score: ${detection.detection.score}`);
            } else {
                console.log(`FaceService: ENHANCED no face detected after ${elapsed}ms`);
            }

            return detection?.descriptor;
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            console.error('FaceService: Enhanced detection error:', errMsg);
            throw e;
        }
    }

    public async loadLabeledDescriptors(people: { id: string; face_descriptor: string | null }[]) {
        console.log('FaceService: Loading descriptors for', people.length, 'people');
        const validPeople = people.filter(p => p.face_descriptor);
        console.log('FaceService: People with descriptors:', validPeople.length);

        this.labeledDescriptors = validPeople
            .map(p => {
                try {
                    const parsed = JSON.parse(p.face_descriptor!);
                    if (!Array.isArray(parsed) || parsed.length !== 128) {
                        console.warn(`FaceService: Invalid descriptor length for ${p.id}: ${parsed.length}`);
                        return null;
                    }
                    const descriptor = new Float32Array(parsed);
                    return new faceapi.LabeledFaceDescriptors(p.id, [descriptor]);
                } catch (e) {
                    console.error(`FaceService: Error parsing descriptor for person ${p.id}`, e);
                    return null;
                }
            })
            .filter((d): d is faceapi.LabeledFaceDescriptors => d !== null);

        console.log('FaceService: Loaded', this.labeledDescriptors.length, 'valid descriptors');
    }

    /**
     * Find a face match in the database
     * @param imageElement - The image/video/canvas element to scan
     * @param enhancedMode - If true, use SsdMobilenetv1 (better for low-light). If false, use TinyFaceDetector (current behavior).
     * @returns Match result with person ID and distance, or null if no match
     */
    public async findMatch(
        imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
        enhancedMode: boolean = false
    ): Promise<{ id: string; distance: number } | null> {
        console.log('FaceService: findMatch called, enhancedMode:', enhancedMode);
        console.log('FaceService: isStandardLoaded:', this.isStandardLoaded, 'isEnhancedLoaded:', this.isEnhancedLoaded);
        console.log('FaceService: descriptors count:', this.labeledDescriptors.length);

        if (this.labeledDescriptors.length === 0) {
            console.warn('FaceService: No labeled descriptors available');
            return null;
        }

        // Use appropriate detection method based on mode
        let descriptor: Float32Array | undefined;
        let matchThreshold: number;

        if (enhancedMode) {
            descriptor = await this.getEnhancedDescriptor(imageElement);
            matchThreshold = ENHANCED_MATCH_THRESHOLD;
        } else {
            descriptor = await this.getDescriptor(imageElement);
            matchThreshold = STANDARD_MATCH_THRESHOLD;
        }

        if (!descriptor) {
            console.log('FaceService: Could not detect face in image');
            return null;
        }

        const faceMatcher = new faceapi.FaceMatcher(this.labeledDescriptors, matchThreshold);
        const match = faceMatcher.findBestMatch(descriptor);

        console.log(`FaceService: ${enhancedMode ? 'ENHANCED' : 'STANDARD'} best match:`, match.label, 'distance:', match.distance);

        if (match.label === 'unknown') {
            return null;
        }

        return { id: match.label, distance: match.distance };
    }
}

export const faceService = FaceService.getInstance();
