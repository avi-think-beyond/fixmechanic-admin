package com.example.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
  primary = AmberSecondary,
  onPrimary = Color.Black,
  primaryContainer = AmberTertiary,
  onPrimaryContainer = Color.White,
  secondary = SlateNavyLight,
  onSecondary = Color.White,
  background = SlateNavyDark,
  surface = SlateNavyMedium,
  onBackground = Color.White,
  onSurface = Color.White
)

private val LightColorScheme = lightColorScheme(
  primary = AmberPrimary,
  onPrimary = Color.White,
  primaryContainer = Color(0xFFFFDBCF),
  onPrimaryContainer = Color(0xFF380D00),
  secondary = SlateNavyMedium,
  onSecondary = Color.White,
  background = NeutralLightBg,
  surface = NeutralSurface,
  onBackground = SlateNavyDark,
  onSurface = SlateNavyDark
)

@Composable
fun FixMechanicAdminTheme(
  darkTheme: Boolean = isSystemInDarkTheme(),
  content: @Composable () -> Unit,
) {
  val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
  MaterialTheme(
    colorScheme = colorScheme,
    typography = Typography,
    content = content
  )
}
