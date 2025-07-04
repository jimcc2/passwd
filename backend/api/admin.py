from django.contrib import admin
from .models import Credential
from .encryption import encrypt_data

class CredentialAdmin(admin.ModelAdmin):
    list_display = ('website_url', 'username', 'user', 'created_at')
    readonly_fields = ('encrypted_password', 'encrypted_mfa_secret', 'created_at', 'updated_at')
    
    # This allows adding/editing credentials via the admin panel
    fields = ('user', 'website_url', 'username', 'password', 'mfa_secret', 'encrypted_password', 'encrypted_mfa_secret')

    # Add a temporary password field to the admin form
    def password(self, obj):
        return ""
    password.short_description = 'New Password (will be encrypted)'

    def mfa_secret(self, obj):
        return ""
    mfa_secret.short_description = 'New MFA Secret (will be encrypted)'

    def save_model(self, request, obj, form, change):
        # Encrypt the password and mfa_secret if they are provided in the form
        if 'password' in form.cleaned_data and form.cleaned_data['password']:
            obj.encrypted_password = encrypt_data(form.cleaned_data['password'])
        if 'mfa_secret' in form.cleaned_data and form.cleaned_data['mfa_secret']:
            obj.encrypted_mfa_secret = encrypt_data(form.cleaned_data['mfa_secret'])
        super().save_model(request, obj, form, change)

# We need to add 'password' and 'mfa_secret' to the form
from django import forms

class CredentialAdminForm(forms.ModelForm):
    password = forms.CharField(widget=forms.PasswordInput, required=False, help_text="Leave blank if you are not changing the password.")
    mfa_secret = forms.CharField(widget=forms.TextInput, required=False)

    class Meta:
        model = Credential
        fields = '__all__'

class PatchedCredentialAdmin(admin.ModelAdmin):
    form = CredentialAdminForm
    list_display = ('website_url', 'username', 'user', 'created_at')
    readonly_fields = ('encrypted_password', 'encrypted_mfa_secret')
    
    def save_model(self, request, obj, form, change):
        if form.cleaned_data.get('password'):
            obj.encrypted_password = encrypt_data(form.cleaned_data['password'])
        if form.cleaned_data.get('mfa_secret'):
            obj.encrypted_mfa_secret = encrypt_data(form.cleaned_data['mfa_secret'])
        super().save_model(request, obj, form, change)

admin.site.register(Credential, PatchedCredentialAdmin)
