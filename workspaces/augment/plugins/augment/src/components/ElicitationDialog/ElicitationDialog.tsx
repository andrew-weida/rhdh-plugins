/*
 * Copyright Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useState, useCallback, useMemo } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme, alpha } from '@mui/material/styles';
import type { PendingElicitationInfo } from '../StreamingMessage/StreamingMessage.types';

interface ElicitationDialogProps {
  elicitation: PendingElicitationInfo;
  onSubmit: (values: Record<string, unknown>) => void;
  onDecline: () => void;
  isSubmitting?: boolean;
  error?: string | null;
}

type ConstOption = { const: string; title?: string };

type SchemaProperty = {
  type?: string;
  title?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  format?: string;
  minimum?: number;
  maximum?: number;
  items?: {
    type?: string;
    enum?: string[];
    anyOf?: Array<{ const?: string; title?: string }>;
  };
  oneOf?: Array<{ const?: string; title?: string }>;
};

function getDefaultValue(prop: SchemaProperty): unknown {
  if (prop.default !== undefined) return prop.default;
  switch (prop.type) {
    case 'boolean':
      return false;
    case 'number':
    case 'integer':
      return '';
    case 'array':
      return [];
    default:
      return '';
  }
}

export function ElicitationDialog({
  elicitation,
  onSubmit,
  onDecline,
  isSubmitting = false,
  error = null,
}: ElicitationDialogProps) {
  const theme = useTheme();
  const properties = useMemo(
    () => elicitation.requestedSchema.properties || {},
    [elicitation.requestedSchema.properties],
  );
  const required = new Set(elicitation.requestedSchema.required || []);

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const [key, rawProp] of Object.entries(properties)) {
      const prop = rawProp as SchemaProperty;
      initial[key] = getDefaultValue(prop);
    }
    return initial;
  });

  const handleChange = useCallback((key: string, value: unknown) => {
    setValues(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(values)) {
      if (val !== '' && val !== undefined) {
        const prop = properties[key] as SchemaProperty | undefined;
        if (prop?.type === 'number' || prop?.type === 'integer') {
          cleaned[key] = Number(val);
        } else {
          cleaned[key] = val;
        }
      }
    }
    onSubmit(cleaned);
  }, [values, properties, onSubmit]);

  const propertyEntries = Object.entries(properties);

  return (
    <Box
      sx={{
        p: 2.5,
        borderRadius: 2,
        border: `1px solid ${alpha(theme.palette.info.main, 0.3)}`,
        bgcolor: alpha(theme.palette.background.paper, 0.95),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ color: theme.palette.info.main }}>
          Input Required
        </Typography>
      </Box>

      <Typography
        variant="body2"
        sx={{ mb: 2, color: theme.palette.text.secondary }}
      >
        {elicitation.message}
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {propertyEntries.map(([key, rawProp]) => {
          const prop = rawProp as SchemaProperty;
          const isRequired = required.has(key);
          const displayName = prop.title ?? key;
          const label = `${displayName}${isRequired ? ' *' : ''}`;

          if (prop.type === 'boolean') {
            return (
              <FormControlLabel
                key={key}
                control={
                  <Checkbox
                    checked={!!values[key]}
                    onChange={e => handleChange(key, e.target.checked)}
                    disabled={isSubmitting}
                    size="small"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">{displayName}</Typography>
                    {prop.description && (
                      <Typography variant="caption" color="text.secondary">
                        {prop.description}
                      </Typography>
                    )}
                  </Box>
                }
              />
            );
          }

          if (prop.enum) {
            return (
              <FormControl key={key} size="small" fullWidth>
                <InputLabel>{label}</InputLabel>
                <Select
                  value={values[key] as string}
                  onChange={e => handleChange(key, e.target.value)}
                  label={label}
                  disabled={isSubmitting}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        display: 'flex',
                        flexDirection: 'column',
                        maxHeight: 300,
                      },
                    },
                  }}
                >
                  {prop.enum.map(opt => (
                    <MenuItem
                      key={opt}
                      value={opt}
                      sx={{ display: 'block', whiteSpace: 'normal' }}
                    >
                      {opt}
                    </MenuItem>
                  ))}
                </Select>
                {prop.description && (
                  <Typography
                    variant="caption"
                    sx={{ mt: 0.5, color: 'text.secondary' }}
                  >
                    {prop.description}
                  </Typography>
                )}
              </FormControl>
            );
          }

          if (prop.oneOf?.some(o => o.const !== undefined)) {
            const options = prop.oneOf.filter(
              (o): o is { const: string; title?: string } =>
                o.const !== undefined,
            );
            return (
              <FormControl key={key} size="small" fullWidth>
                <InputLabel>{label}</InputLabel>
                <Select
                  value={values[key] as string}
                  onChange={e => handleChange(key, e.target.value)}
                  label={label}
                  disabled={isSubmitting}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        display: 'flex',
                        flexDirection: 'column',
                        maxHeight: 300,
                      },
                    },
                  }}
                >
                  {options.map(opt => (
                    <MenuItem
                      key={opt.const}
                      value={opt.const}
                      sx={{ display: 'block', whiteSpace: 'normal' }}
                    >
                      {opt.title ?? opt.const}
                    </MenuItem>
                  ))}
                </Select>
                {prop.description && (
                  <Typography
                    variant="caption"
                    sx={{ mt: 0.5, color: 'text.secondary' }}
                  >
                    {prop.description}
                  </Typography>
                )}
              </FormControl>
            );
          }

          if (prop.type === 'array') {
            const selected = (values[key] as string[]) || [];

            const anyOfOptions = prop.items?.anyOf?.filter(
              (o): o is ConstOption => o.const !== undefined,
            );
            if (anyOfOptions?.length) {
              return (
                <Box key={key}>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    {label}
                  </Typography>
                  {prop.description && (
                    <Typography
                      variant="caption"
                      sx={{
                        mb: 0.5,
                        display: 'block',
                        color: 'text.secondary',
                      }}
                    >
                      {prop.description}
                    </Typography>
                  )}
                  {anyOfOptions.map(opt => (
                    <FormControlLabel
                      key={opt.const}
                      control={
                        <Checkbox
                          checked={selected.includes(opt.const)}
                          onChange={e => {
                            const next = e.target.checked
                              ? [...selected, opt.const]
                              : selected.filter(s => s !== opt.const);
                            handleChange(key, next);
                          }}
                          disabled={isSubmitting}
                          size="small"
                        />
                      }
                      label={opt.title ?? opt.const}
                    />
                  ))}
                </Box>
              );
            }

            if (prop.items?.enum) {
              return (
                <Box key={key}>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    {label}
                  </Typography>
                  {prop.description && (
                    <Typography
                      variant="caption"
                      sx={{
                        mb: 0.5,
                        display: 'block',
                        color: 'text.secondary',
                      }}
                    >
                      {prop.description}
                    </Typography>
                  )}
                  {prop.items.enum.map(opt => (
                    <FormControlLabel
                      key={opt}
                      control={
                        <Checkbox
                          checked={selected.includes(opt)}
                          onChange={e => {
                            const next = e.target.checked
                              ? [...selected, opt]
                              : selected.filter(s => s !== opt);
                            handleChange(key, next);
                          }}
                          disabled={isSubmitting}
                          size="small"
                        />
                      }
                      label={opt}
                    />
                  ))}
                </Box>
              );
            }
          }

          const formatToType: Record<string, string> = {
            email: 'email',
            uri: 'url',
            date: 'date',
            'date-time': 'datetime-local',
          };
          const isNumeric = prop.type === 'number' || prop.type === 'integer';
          const inputType = isNumeric
            ? 'number'
            : (prop.format && formatToType[prop.format]) || 'text';

          const inputProps: Record<string, unknown> = {};
          if (isNumeric) {
            if (prop.minimum !== undefined) inputProps.min = prop.minimum;
            if (prop.maximum !== undefined) inputProps.max = prop.maximum;
            if (prop.type === 'integer') inputProps.step = 1;
          } else {
            if (prop.minLength !== undefined)
              inputProps.minLength = prop.minLength;
            if (prop.maxLength !== undefined)
              inputProps.maxLength = prop.maxLength;
          }

          return (
            <TextField
              key={key}
              label={label}
              value={values[key] as string}
              onChange={e => handleChange(key, e.target.value)}
              type={inputType}
              inputProps={inputProps}
              helperText={prop.description}
              required={isRequired}
              disabled={isSubmitting}
              size="small"
              fullWidth
            />
          );
        })}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
        <Button
          variant="outlined"
          size="small"
          onClick={onDecline}
          disabled={isSubmitting}
        >
          Decline
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={handleSubmit}
          disabled={isSubmitting}
          startIcon={isSubmitting ? <CircularProgress size={14} /> : undefined}
        >
          Submit
        </Button>
      </Box>

      {error && (
        <Typography
          variant="caption"
          sx={{
            color: 'error.main',
            mt: 1,
            textAlign: 'center',
            display: 'block',
          }}
        >
          {error}
        </Typography>
      )}
    </Box>
  );
}
