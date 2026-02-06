import { format as dateFnsFormat, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toZonedTime, format as tzFormat } from 'date-fns-tz';

/**
 * Map of timezone identifiers to country flags
 */
const TIMEZONE_FLAGS: Record<string, string> = {
    // Bolivia
    'America/La_Paz': '🇧🇴',

    // Paraguay
    'America/Asuncion': '🇵🇾',

    // Chile
    'America/Santiago': '🇨🇱',
    'America/Punta_Arenas': '🇨🇱',

    // Peru
    'America/Lima': '🇵🇪',

    // Argentina
    'America/Buenos_Aires': '🇦🇷',
    'America/Argentina/Buenos_Aires': '🇦🇷',
    'America/Cordoba': '🇦🇷',
    'America/Mendoza': '🇦🇷',

    // Colombia
    'America/Bogota': '🇨🇴',

    // Ecuador
    'America/Guayaquil': '🇪🇨',

    // Venezuela
    'America/Caracas': '🇻🇪',

    // Uruguay
    'America/Montevideo': '🇺🇾',

    // Brazil
    'America/Sao_Paulo': '🇧🇷',
    'America/Brasilia': '🇧🇷',

    // Mexico
    'America/Mexico_City': '🇲🇽',

    // USA
    'America/New_York': '🇺🇸',
    'America/Los_Angeles': '🇺🇸',
    'America/Chicago': '🇺🇸',

    // Spain
    'Europe/Madrid': '🇪🇸',
};

/**
 * Get country flag emoji for a timezone
 * @param timezone - IANA timezone string (e.g., 'America/La_Paz')
 * @returns Flag emoji or 🌐 if not found
 */
export function getCountryFlag(timezone: string): string {
    return TIMEZONE_FLAGS[timezone] || '🌐';
}

/**
 * Get country name for a timezone
 * @param timezone - IANA timezone string
 * @returns Country name in Spanish
 */
export function getCountryName(timezone: string): string {
    const countryMap: Record<string, string> = {
        'America/La_Paz': 'Bolivia',
        'America/Asuncion': 'Paraguay',
        'America/Santiago': 'Chile',
        'America/Lima': 'Perú',
        'America/Buenos_Aires': 'Argentina',
        'America/Argentina/Buenos_Aires': 'Argentina',
        'America/Bogota': 'Colombia',
        'America/Guayaquil': 'Ecuador',
        'America/Caracas': 'Venezuela',
        'America/Montevideo': 'Uruguay',
        'America/Sao_Paulo': 'Brasil',
        'America/Mexico_City': 'México',
        'Europe/Madrid': 'España',
    };
    return countryMap[timezone] || timezone;
}

/**
 * Format a date in the site's timezone
 * @param date - Date to format (Date object, ISO string, or timestamp)
 * @param timezone - IANA timezone string (e.g., 'America/La_Paz')
 * @param formatStr - date-fns format string (default: 'dd/MM/yyyy HH:mm')
 * @returns Formatted date string in site's timezone
 */
export function formatSiteDate(
    date: Date | string | number,
    timezone: string,
    formatStr: string = 'dd/MM/yyyy HH:mm'
): string {
    try {
        const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
        const zonedDate = toZonedTime(dateObj, timezone);
        return tzFormat(zonedDate, formatStr, { locale: es, timeZone: timezone });
    } catch (error) {
        console.error('Error formatting date:', error);
        // Fallback to simple format
        const dateObj = typeof date === 'string' ? new Date(date) : new Date(date);
        return dateFnsFormat(dateObj, formatStr, { locale: es });
    }
}

/**
 * Format time only in site's timezone
 * @param date - Date to format
 * @param timezone - IANA timezone string
 * @returns Time string (e.g., '14:30')
 */
export function formatSiteTime(
    date: Date | string | number,
    timezone: string
): string {
    return formatSiteDate(date, timezone, 'HH:mm');
}

/**
 * Format date for display with day name (e.g., "Vie 6 feb")
 * @param date - Date to format
 * @param timezone - IANA timezone string
 * @returns Short date string with day name
 */
export function formatSiteDateShort(
    date: Date | string | number,
    timezone: string
): string {
    return formatSiteDate(date, timezone, 'EEE d MMM');
}

/**
 * Format full date with time for logs/records
 * @param date - Date to format
 * @param timezone - IANA timezone string
 * @returns Full date and time string
 */
export function formatSiteDateTime(
    date: Date | string | number,
    timezone: string
): string {
    return formatSiteDate(date, timezone, 'dd/MM/yyyy HH:mm');
}

/**
 * Format date for reports (long format)
 * @param date - Date to format
 * @param timezone - IANA timezone string
 * @returns Long date string (e.g., "viernes, 6 de febrero 2026")
 */
export function formatSiteDateLong(
    date: Date | string | number,
    timezone: string
): string {
    return formatSiteDate(date, timezone, "EEEE, d 'de' MMMM yyyy");
}

/**
 * Get current time in site's timezone
 * @param timezone - IANA timezone string
 * @returns Current Date object adjusted to site's timezone
 */
export function getSiteCurrentTime(timezone: string): Date {
    return toZonedTime(new Date(), timezone);
}
