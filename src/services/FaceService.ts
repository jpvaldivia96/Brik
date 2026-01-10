import * as faceapi from 'face-api.js';
import { Capacitor } from '@capacitor/core';

// Using TinyFaceDetector for better mobile compatibility
const FACE_DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 });

// Different model paths to try
const MODEL_PATHS = [
    '/models',
    './models',
    'models',
];

export class FaceService {
    private static instance: FaceService;
    private isLoaded: boolean = false;
    private loadError: string | null = null;
    private labeledDescriptors: faceapi.LabeledFaceDescriptors[] = [];
    private workingModelUrl: string | null = null;

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
        return this.isLoaded;
    }

    // Test if we can fetch a model file from a given path
    private async testModelPath(basePath: string): Promise<boolean> {
        const testFile = `${basePath}/tiny_face_detector_model-weights_manifest.json`;
        console.log('FaceService: Testing path:', testFile);

        try {
            const response = await fetch(testFile, { method: 'HEAD' });
            console.log('FaceService: Path test result:', response.ok, response.status);
            return response.ok;
        } catch (error: any) {
            console.log('FaceService: Path test failed:', error?.message || error);
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
            // On native, try origin-based paths first
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

    public async loadModels(): Promise<void> {
        if (this.isLoaded) {
            console.log('FaceService: Models already loaded');
            return;
        }

        console.log('=== FaceService: Starting model load ===');
        this.loadError = null;

        try {
            // Find a working path first
            this.workingModelUrl = await this.findWorkingModelPath();

            if (!this.workingModelUrl) {
                const error = 'No se pudo acceder a los modelos de IA en ninguna ruta';
                console.error('FaceService:', error);
                this.loadError = error;
                throw new Error(error);
            }

            console.log('FaceService: Loading models from:', this.workingModelUrl);

            // Load models sequentially with detailed logging
            console.log('FaceService: Loading tinyFaceDetector...');
            await faceapi.nets.tinyFaceDetector.loadFromUri(this.workingModelUrl);
            console.log('FaceService: ✓ tinyFaceDetector loaded');

            console.log('FaceService: Loading faceLandmark68Net...');
            await faceapi.nets.faceLandmark68Net.loadFromUri(this.workingModelUrl);
            console.log('FaceService: ✓ faceLandmark68Net loaded');

            console.log('FaceService: Loading faceRecognitionNet...');
            await faceapi.nets.faceRecognitionNet.loadFromUri(this.workingModelUrl);
            console.log('FaceService: ✓ faceRecognitionNet loaded');

            this.isLoaded = true;
            this.loadError = null;
            console.log('=== FaceService: All models loaded successfully ===');

        } catch (error: any) {
            const errorMsg = error?.message || 'Error desconocido al cargar modelos';
            console.error('FaceService: Load failed:', errorMsg);
            this.loadError = errorMsg;
            this.isLoaded = false;
            throw error;
        }
    }

    public async getDescriptor(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<Float32Array | undefined> {
        if (!this.isLoaded) {
            console.log('FaceService: Models not loaded, loading now...');
            await this.loadModels();
        }

        if (!this.isLoaded) {
            throw new Error('Los modelos de IA no se pudieron cargar: ' + (this.loadError || 'Error desconocido'));
        }

        console.log('FaceService: Starting face detection...');
        const startTime = Date.now();

        try {
            const detection = await faceapi
                .detectSingleFace(imageElement, FACE_DETECTOR_OPTIONS)
                .withFaceLandmarks()
                .withFaceDescriptor();

            const elapsed = Date.now() - startTime;

            if (detection) {
                console.log(`FaceService: Face detected in ${elapsed}ms, score: ${detection.detection.score}`);
            } else {
                console.log(`FaceService: No face detected after ${elapsed}ms`);
            }

            return detection?.descriptor;
        } catch (e: any) {
            console.error('FaceService: Detection error:', e?.message || e);
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

    public async findMatch(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<{ id: string; distance: number } | null> {
        console.log('FaceService: findMatch called');
        console.log('FaceService: isLoaded:', this.isLoaded);
        console.log('FaceService: descriptors count:', this.labeledDescriptors.length);

        if (!this.isLoaded) {
            console.error('FaceService: Cannot find match - models not loaded');
            throw new Error('Los modelos de IA no están cargados: ' + (this.loadError || 'Intente recargar la aplicación'));
        }

        if (this.labeledDescriptors.length === 0) {
            console.warn('FaceService: No labeled descriptors available');
            return null;
        }

        const descriptor = await this.getDescriptor(imageElement);
        if (!descriptor) {
            console.log('FaceService: Could not detect face in image');
            return null;
        }

        const faceMatcher = new faceapi.FaceMatcher(this.labeledDescriptors, 0.6);
        const match = faceMatcher.findBestMatch(descriptor);

        console.log('FaceService: Best match:', match.label, 'distance:', match.distance);

        if (match.label === 'unknown') {
            return null;
        }

        return { id: match.label, distance: match.distance };
    }
}

export const faceService = FaceService.getInstance();
