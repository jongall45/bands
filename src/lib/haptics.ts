'use client'

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

/**
 * Haptic feedback utilities for iOS
 * Uses Capacitor's native Haptics plugin for proper iOS Taptic Engine support
 */

// Impact feedback - for button presses, selections
export const hapticImpact = async (style: 'light' | 'medium' | 'heavy' = 'medium') => {
    try {
        const impactStyle = {
            light: ImpactStyle.Light,
            medium: ImpactStyle.Medium,
            heavy: ImpactStyle.Heavy,
        }[style]
        await Haptics.impact({ style: impactStyle })
    } catch (e) {
        // Haptics not available (web browser, unsupported device)
    }
}

// Notification feedback - for success, warning, error states
export const hapticNotification = async (type: 'success' | 'warning' | 'error' = 'success') => {
    try {
        const notificationType = {
            success: NotificationType.Success,
            warning: NotificationType.Warning,
            error: NotificationType.Error,
        }[type]
        await Haptics.notification({ type: notificationType })
    } catch (e) {
        // Haptics not available
    }
}

// Selection feedback - for picker/selection changes
export const hapticSelection = async () => {
    try {
        await Haptics.selectionStart()
        await Haptics.selectionChanged()
        await Haptics.selectionEnd()
    } catch (e) {
        // Haptics not available
    }
}

// Vibrate - for stronger feedback (uses device vibration)
export const hapticVibrate = async (duration: number = 300) => {
    try {
        await Haptics.vibrate({ duration })
    } catch (e) {
        // Haptics not available
    }
}

// Convenience exports for common use cases
export const haptics = {
    // Button presses
    buttonTap: () => hapticImpact('light'),
    buttonPress: () => hapticImpact('medium'),
    buttonHeavy: () => hapticImpact('heavy'),

    // Notifications
    success: () => hapticNotification('success'),
    warning: () => hapticNotification('warning'),
    error: () => hapticNotification('error'),

    // Selection
    selection: () => hapticSelection(),

    // Custom
    impact: hapticImpact,
    notification: hapticNotification,
    vibrate: hapticVibrate,
}

export default haptics
