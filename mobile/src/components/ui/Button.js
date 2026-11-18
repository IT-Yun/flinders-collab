import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import colors from '../../theme/colors';

/**
 * Styled button component with primary / secondary / outline variants.
 *
 * Props:
 *   variant    {'primary' | 'secondary' | 'outline'}  — default 'primary'
 *   loading    {boolean}   — show spinner and disable interaction
 *   disabled   {boolean}   — disabled state
 *   children   {node}      — button label text
 *   style      {object}    — additional TouchableOpacity style
 *   textStyle  {object}    — additional Text style
 *   onPress    {function}  — press handler
 */
export function Button({
  variant = 'primary',
  loading = false,
  disabled = false,
  children,
  style,
  textStyle,
  onPress,
  ...rest
}) {
  const isDisabled = disabled || loading;

  const containerStyle = [
    styles.base,
    styles[variant] || styles.primary,
    isDisabled && styles.disabled,
    style,
  ];

  const labelStyle = [
    styles.text,
    styles[`${variant}Text`] || styles.primaryText,
    isDisabled && styles.disabledText,
    textStyle,
  ];

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      {...rest}
    >
      {loading ? (
        <View style={styles.row}>
          <ActivityIndicator
            size="small"
            color={variant === 'primary' ? colors.white : colors.primary}
            style={styles.spinner}
          />
          <Text style={labelStyle}>Loading…</Text>
        </View>
      ) : (
        <Text style={labelStyle}>{children}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spinner: {
    marginRight: 8,
  },

  // Variants
  primary: {
    backgroundColor: colors.primary,
  },
  primaryText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },

  secondary: {
    backgroundColor: colors.secondary,
  },
  secondaryText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },

  outline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  outlineText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },

  // Disabled
  disabled: {
    opacity: 0.5,
  },
  disabledText: {
    color: colors.disabledText,
  },

  // Generic text (fallback)
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default Button;
